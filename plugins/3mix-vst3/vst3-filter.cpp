// Filtro de áudio que hospeda plugins VST3 de 64 bits, com o SDK oficial da Steinberg (MIT).
// O plugin é carregado na thread da interface, como o VST3 exige. Enquanto não está pronto, o áudio passa direto.
#include <obs-module.h>
#include <obs-frontend-api.h>
#include <obs.hpp>

#include <QCoreApplication>
#include <QCloseEvent>
#include <QDir>
#include <QDirIterator>
#include <QFileInfo>
#include <QPointer>
#include <QThread>
#include <QTimer>
#include <QWidget>

#include "public.sdk/source/common/memorystream.h"
#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"
#include "public.sdk/source/vst/hosting/plugprovider.h"
#include "public.sdk/source/vst/hosting/processdata.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"

#include <algorithm>
#include <functional>
#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

OBS_DECLARE_MODULE()
MODULE_EXPORT const char *obs_module_description(void)
{
	return "VST3 plug-in filter";
}

namespace Steinberg {
DEF_CLASS_IID(IPlugFrame)
DEF_CLASS_IID(IPlugViewContentScaleSupport)
}

using namespace Steinberg;
using namespace Steinberg::Vst;

#define S_PATH "plugin_path"
#define S_COMPONENT "state_component"
#define S_CONTROLLER "state_controller"
#define S_OPEN "open_vst_settings"
constexpr int32 MAX_BLOCK = 4096;

static HostApplication &hostContext()
{
	static HostApplication *app = [] {
		auto *h = new HostApplication();
		PluginContextFactory::instance().setPluginContext(h);
		return h;
	}();
	return *app;
}

struct Vst3Filter;

// Recebe as mudanças feitas na janela do plugin e as leva ao processamento de áudio.
class ComponentHandler : public IComponentHandler {
public:
	explicit ComponentHandler(Vst3Filter *owner) : owner(owner) {}
	virtual ~ComponentHandler() = default;
	tresult PLUGIN_API beginEdit(ParamID) override { return kResultOk; }
	tresult PLUGIN_API performEdit(ParamID id, ParamValue value) override;
	tresult PLUGIN_API endEdit(ParamID) override;
	tresult PLUGIN_API restartComponent(int32 flags) override;
	tresult PLUGIN_API queryInterface(const TUID iid, void **obj) override
	{
		QUERY_INTERFACE(iid, obj, FUnknown::iid, IComponentHandler)
		QUERY_INTERFACE(iid, obj, IComponentHandler::iid, IComponentHandler)
		*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef() override { return 1; }
	uint32 PLUGIN_API release() override { return 1; }
	Vst3Filter *owner;
};

class EditorWindow;

// Tudo aqui, fora process(), roda na thread da interface.
struct Vst3Filter {
	obs_source_t *context = nullptr;
	std::string path;
	std::string requestedPath;
	std::string name;

	VST3::Hosting::Module::Ptr module;
	IPtr<PlugProvider> provider;
	IPtr<IComponent> component;
	IPtr<IEditController> controller;
	FUnknownPtr<IAudioProcessor> processor;
	ComponentHandler handler{this};

	HostProcessData processData;
	ParameterChanges inputChanges{64};
	ParameterChanges outputChanges{64};
	ParameterChangeTransfer toProcessor;
	ParameterChangeTransfer fromProcessor;
	ProcessContext processContext{};

	std::mutex audioLock;
	std::atomic<bool> ready{false};
	std::atomic<bool> destroying{false};
	int32 inputChannels = 0;
	int32 outputChannels = 0;
	uint32_t sampleRate = 48000;
	int64 samplePosition = 0;

	QByteArray savedComponent;
	QByteArray savedController;
	QPointer<EditorWindow> editor;
	// Pedidos em fila somem junto com este objeto, então nunca rodam num filtro já destruído.
	QObject ui;
	QTimer *saveTimer = nullptr;

	Vst3Filter();
	~Vst3Filter();
	void load();
	void unload();
	bool activate();
	void deactivate();
	void restart();
	void openEditor();
	void closeEditor();
	void captureState();
	void persist();
	void restoreState();
	void process(struct obs_audio_data *audio);
};

static void runOnUi(Vst3Filter *filter, std::function<void()> work)
{
	QMetaObject::invokeMethod(&filter->ui, std::move(work), Qt::QueuedConnection);
}

static bool onUiThread()
{
	QCoreApplication *app = QCoreApplication::instance();
	return app && QThread::currentThread() == app->thread();
}

tresult PLUGIN_API ComponentHandler::performEdit(ParamID id, ParamValue value)
{
	owner->toProcessor.addChange(id, value, 0);
	return kResultOk;
}

// Ajuste feito na janela do plugin vai para o disco logo em seguida: uma queda do motor não leva o patch junto.
tresult PLUGIN_API ComponentHandler::endEdit(ParamID)
{
	runOnUi(owner, [o = owner] { o->saveTimer->start(); });
	return kResultOk;
}

tresult PLUGIN_API ComponentHandler::restartComponent(int32 flags)
{
	if (flags & (kReloadComponent | kIoChanged | kLatencyChanged))
		runOnUi(owner, [o = owner] { o->restart(); });
	return kResultOk;
}

// Janela nativa do plugin.
class EditorWindow : public QWidget, public IPlugFrame {
public:
	EditorWindow(Vst3Filter *owner, IPlugView *view) : QWidget(nullptr, Qt::Window), owner(owner), view(view)
	{
		setAttribute(Qt::WA_DeleteOnClose);
		setAttribute(Qt::WA_NativeWindow);
		setWindowTitle(QString::fromStdString(owner->name));
		meters.setInterval(50);
		QObject::connect(&meters, &QTimer::timeout, this, [this] { applyOutputs(); });
		meters.start();
	}
	~EditorWindow() override
	{
		meters.stop();
		if (view) {
			view->setFrame(nullptr);
			if (attached)
				view->removed();
			view = nullptr;
		}
		if (owner) {
			owner->editor = nullptr;
			owner->persist();
		}
	}
	bool attach()
	{
		const qreal ratio = devicePixelRatioF();
		FUnknownPtr<IPlugViewContentScaleSupport> scale(view.get());
		if (scale)
			scale->setContentScaleFactor(static_cast<float>(ratio));
		ViewRect size{};
		if (view->getSize(&size) != kResultOk)
			size = ViewRect(0, 0, 640, 400);
		applySize(size);
		view->setFrame(this);
		attached = view->attached(reinterpret_cast<void *>(winId()), kPlatformTypeHWND) == kResultOk;
		return attached;
	}
	void applySize(const ViewRect &size)
	{
		const qreal ratio = devicePixelRatioF();
		resize(qMax(100, qRound(size.getWidth() / ratio)), qMax(60, qRound(size.getHeight() / ratio)));
	}
	void applyOutputs()
	{
		if (owner && owner->controller)
			owner->fromProcessor.transferChangesTo(outputs);
		if (owner && owner->controller) {
			for (int32 i = 0; i < outputs.getParameterCount(); i++) {
				IParamValueQueue *queue = outputs.getParameterData(i);
				int32 offset = 0;
				ParamValue value = 0;
				if (queue && queue->getPoint(queue->getPointCount() - 1, offset, value) == kResultOk)
					owner->controller->setParamNormalized(queue->getParameterId(), value);
			}
		}
		outputs.clearQueue();
	}
	tresult PLUGIN_API resizeView(IPlugView *v, ViewRect *size) override
	{
		if (!v || !size)
			return kInvalidArgument;
		applySize(*size);
		v->onSize(size);
		return kResultOk;
	}
	tresult PLUGIN_API queryInterface(const TUID iid, void **obj) override
	{
		QUERY_INTERFACE(iid, obj, FUnknown::iid, IPlugFrame)
		QUERY_INTERFACE(iid, obj, IPlugFrame::iid, IPlugFrame)
		*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef() override { return 1; }
	uint32 PLUGIN_API release() override { return 1; }
	Vst3Filter *owner;

protected:
	void resizeEvent(QResizeEvent *event) override
	{
		QWidget::resizeEvent(event);
		if (view && view->canResize() == kResultTrue) {
			const qreal ratio = devicePixelRatioF();
			ViewRect rect(0, 0, qRound(width() * ratio), qRound(height() * ratio));
			view->onSize(&rect);
		}
	}

private:
	IPtr<IPlugView> view;
	bool attached = false;
	QTimer meters;
	ParameterChanges outputs{64};
};

Vst3Filter::Vst3Filter()
{
	saveTimer = new QTimer(&ui);
	saveTimer->setSingleShot(true);
	saveTimer->setInterval(1500);
	QObject::connect(saveTimer, &QTimer::timeout, &ui, [this] { persist(); });
	if (QCoreApplication *app = QCoreApplication::instance())
		ui.moveToThread(app->thread());
}

Vst3Filter::~Vst3Filter()
{
	unload();
}

void Vst3Filter::load()
{
	if (destroying)
		return;
	unload();
	path = requestedPath;
	if (path.empty())
		return;

	std::string error;
	hostContext();
	module = VST3::Hosting::Module::create(path, error);
	if (!module) {
		blog(LOG_WARNING, "[3Mix VST3] Could not load '%s': %s", path.c_str(), error.c_str());
		return;
	}
	const auto classes = module->getFactory().classInfos();
	for (const auto &info : classes) {
		if (info.category() != kVstAudioEffectClass)
			continue;
		provider = owned(new PlugProvider(module->getFactory(), info, true));
		if (!provider->initialize()) {
			provider = nullptr;
			continue;
		}
		name = info.name();
		break;
	}
	if (!provider) {
		blog(LOG_WARNING, "[3Mix VST3] No usable audio effect in '%s'", path.c_str());
		module = nullptr;
		return;
	}
	component = provider->getComponentPtr();
	controller = provider->getControllerPtr();
	processor = FUnknownPtr<IAudioProcessor>(component.get());
	if (!processor) {
		blog(LOG_WARNING, "[3Mix VST3] '%s' has no audio processor", path.c_str());
		unload();
		return;
	}
	if (controller)
		controller->setComponentHandler(&handler);
	restoreState();
	if (!activate()) {
		blog(LOG_WARNING, "[3Mix VST3] Could not activate '%s'", path.c_str());
		unload();
		return;
	}
	blog(LOG_INFO, "[3Mix VST3] Loaded '%s' (%s), %d in, %d out, latency %u samples", name.c_str(), path.c_str(),
	     inputChannels, outputChannels, processor->getLatencySamples());
}

bool Vst3Filter::activate()
{
	obs_audio_info info;
	if (obs_get_audio_info(&info))
		sampleRate = info.samples_per_sec;

	// Só o barramento principal: nada de sidechain nem saídas extras.
	for (auto direction : {kInput, kOutput}) {
		const int32 count = component->getBusCount(kAudio, direction);
		for (int32 i = 0; i < count; i++)
			component->activateBus(kAudio, direction, i, i == 0);
	}
	if (component->getBusCount(kAudio, kInput) < 1 || component->getBusCount(kAudio, kOutput) < 1)
		return false;

	SpeakerArrangement in = SpeakerArr::kStereo, out = SpeakerArr::kStereo;
	processor->setBusArrangements(&in, 1, &out, 1);
	if (processor->getBusArrangement(kInput, 0, in) != kResultOk ||
	    processor->getBusArrangement(kOutput, 0, out) != kResultOk)
		return false;
	inputChannels = SpeakerArr::getChannelCount(in);
	outputChannels = SpeakerArr::getChannelCount(out);
	if (inputChannels < 1 || outputChannels < 1)
		return false;

	ProcessSetup setup{kRealtime, kSample32, MAX_BLOCK, static_cast<SampleRate>(sampleRate)};
	if (processor->setupProcessing(setup) != kResultOk)
		return false;
	if (component->setActive(true) != kResultOk)
		return false;

	processData.unprepare();
	processData.prepare(*component, MAX_BLOCK, kSample32);
	processData.processMode = kRealtime;
	processData.inputParameterChanges = &inputChanges;
	processData.outputParameterChanges = &outputChanges;
	processContext = {};
	processContext.sampleRate = sampleRate;
	processContext.tempo = 120.0;
	processContext.timeSigNumerator = 4;
	processContext.timeSigDenominator = 4;
	processContext.state = ProcessContext::kPlaying | ProcessContext::kTempoValid | ProcessContext::kTimeSigValid;
	processData.processContext = &processContext;
	if (controller) {
		const int32 params = controller->getParameterCount();
		toProcessor.setMaxParameters(params);
		fromProcessor.setMaxParameters(params);
	}
	processor->setProcessing(true);
	ready = true;
	return true;
}

void Vst3Filter::deactivate()
{
	ready = false;
	std::lock_guard<std::mutex> lock(audioLock);
	if (processor)
		processor->setProcessing(false);
	if (component)
		component->setActive(false);
}

void Vst3Filter::restart()
{
	if (destroying || !component || !processor)
		return;
	deactivate();
	std::lock_guard<std::mutex> lock(audioLock);
	if (!activate())
		blog(LOG_WARNING, "[3Mix VST3] Could not restart '%s'", name.c_str());
}

void Vst3Filter::unload()
{
	closeEditor();
	deactivate();
	std::lock_guard<std::mutex> lock(audioLock);
	if (controller)
		controller->setComponentHandler(nullptr);
	processData.unprepare();
	processor = FUnknownPtr<IAudioProcessor>(nullptr);
	controller = nullptr;
	component = nullptr;
	provider = nullptr;
	module = nullptr;
	name.clear();
}

void Vst3Filter::openEditor()
{
	if (!controller)
		return;
	if (editor) {
		editor->show();
		editor->raise();
		editor->activateWindow();
		return;
	}
	IPtr<IPlugView> view = owned(controller->createView(ViewType::kEditor));
	if (!view || view->isPlatformTypeSupported(kPlatformTypeHWND) != kResultTrue) {
		blog(LOG_WARNING, "[3Mix VST3] '%s' has no editor", name.c_str());
		return;
	}
	auto *window = new EditorWindow(this, view);
	editor = window;
	window->show();
	if (!window->attach()) {
		blog(LOG_WARNING, "[3Mix VST3] '%s' refused the editor window", name.c_str());
		delete window;
	}
}

void Vst3Filter::closeEditor()
{
	// Sem close(): ele adia a destruição, e a janela precisa sair antes de o módulo ser descarregado.
	if (editor) {
		editor->owner = nullptr;
		delete editor.data();
		editor = nullptr;
	}
}

void Vst3Filter::captureState()
{
	if (!component)
		return;
	MemoryStream a;
	if (component->getState(&a) == kResultOk)
		savedComponent = QByteArray(a.getData(), static_cast<qsizetype>(a.getSize()));
	if (controller) {
		MemoryStream b;
		if (controller->getState(&b) == kResultOk)
			savedController = QByteArray(b.getData(), static_cast<qsizetype>(b.getSize()));
	}
}

void Vst3Filter::persist()
{
	if (destroying || !component || !context)
		return;
	captureState();
	OBSDataAutoRelease settings = obs_source_get_settings(context);
	obs_data_set_string(settings, S_COMPONENT, savedComponent.toBase64().constData());
	obs_data_set_string(settings, S_CONTROLLER, savedController.toBase64().constData());
	obs_frontend_save();
}

void Vst3Filter::restoreState()
{
	if (!savedComponent.isEmpty()) {
		MemoryStream a(savedComponent.data(), savedComponent.size());
		component->setState(&a);
		if (controller) {
			MemoryStream again(savedComponent.data(), savedComponent.size());
			controller->setComponentState(&again);
		}
	}
	if (controller && !savedController.isEmpty()) {
		MemoryStream b(savedController.data(), savedController.size());
		controller->setState(&b);
	}
}

void Vst3Filter::process(struct obs_audio_data *audio)
{
	if (!ready || destroying)
		return;
	std::unique_lock<std::mutex> lock(audioLock, std::try_to_lock);
	if (!lock.owns_lock() || !ready)
		return;

	const size_t channels = audio_output_get_channels(obs_get_audio());
	uint32_t done = 0;
	while (done < audio->frames) {
		const int32 count = static_cast<int32>(std::min<uint32_t>(audio->frames - done, MAX_BLOCK));
		for (int32 c = 0; c < inputChannels; c++) {
			const size_t from = std::min<size_t>(c, channels - 1);
			if (audio->data[from])
				memcpy(processData.inputs[0].channelBuffers32[c], reinterpret_cast<float *>(audio->data[from]) + done,
				       sizeof(float) * count);
			else
				memset(processData.inputs[0].channelBuffers32[c], 0, sizeof(float) * count);
		}
		inputChanges.clearQueue();
		outputChanges.clearQueue();
		toProcessor.transferChangesTo(inputChanges);
		processData.numSamples = count;
		processContext.projectTimeSamples = samplePosition;
		processContext.continousTimeSamples = samplePosition;
		if (processor->process(processData) != kResultOk)
			return;
		fromProcessor.transferChangesFrom(outputChanges);
		samplePosition += count;
		for (size_t c = 0; c < channels; c++) {
			if (!audio->data[c])
				continue;
			const int32 from = std::min<int32>(static_cast<int32>(c), outputChannels - 1);
			memcpy(reinterpret_cast<float *>(audio->data[c]) + done, processData.outputs[0].channelBuffers32[from],
			       sizeof(float) * count);
		}
		done += count;
	}
}

// --------------------------------------------------------------------- filtro

static const char *vst3_name(void *)
{
	return "VST3";
}

static void vst3_update(void *data, obs_data_t *settings)
{
	auto *f = static_cast<Vst3Filter *>(data);
	const std::string path = obs_data_get_string(settings, S_PATH);
	if (path == f->requestedPath)
		return;
	f->requestedPath = path;
	f->savedComponent = QByteArray::fromBase64(obs_data_get_string(settings, S_COMPONENT));
	f->savedController = QByteArray::fromBase64(obs_data_get_string(settings, S_CONTROLLER));
	runOnUi(f, [f] { f->load(); });
}

static void *vst3_create(obs_data_t *settings, obs_source_t *context)
{
	auto *f = new Vst3Filter();
	f->context = context;
	vst3_update(f, settings);
	return f;
}

// Pode rodar fora da thread da interface: o processamento para na hora e o restante é desfeito na interface.
static void vst3_destroy(void *data)
{
	auto *f = static_cast<Vst3Filter *>(data);
	f->destroying = true;
	f->ready = false;
	if (onUiThread())
		delete f;
	else
		QMetaObject::invokeMethod(QCoreApplication::instance(), [f] { delete f; }, Qt::QueuedConnection);
}

static void vst3_save(void *data, obs_data_t *settings)
{
	auto *f = static_cast<Vst3Filter *>(data);
	if (onUiThread())
		f->captureState();
	if (!f->savedComponent.isEmpty())
		obs_data_set_string(settings, S_COMPONENT, f->savedComponent.toBase64().constData());
	if (!f->savedController.isEmpty())
		obs_data_set_string(settings, S_CONTROLLER, f->savedController.toBase64().constData());
}

static struct obs_audio_data *vst3_filter_audio(void *data, struct obs_audio_data *audio)
{
	static_cast<Vst3Filter *>(data)->process(audio);
	return audio;
}

static bool vst3_open_clicked(obs_properties_t *, obs_property_t *, void *data)
{
	auto *f = static_cast<Vst3Filter *>(data);
	runOnUi(f, [f] { f->openEditor(); });
	return false;
}

static obs_properties_t *vst3_properties(void *data)
{
	obs_properties_t *props = obs_properties_create();
	obs_property_t *list = obs_properties_add_list(props, S_PATH, "VST3", OBS_COMBO_TYPE_LIST, OBS_COMBO_FORMAT_STRING);
	obs_property_list_add_string(list, "", "");
	for (const auto &path : VST3::Hosting::Module::getModulePaths()) {
		const QFileInfo info(QString::fromStdString(path));
		obs_property_list_add_string(list, info.completeBaseName().toUtf8().constData(), path.c_str());
	}
	obs_properties_add_button2(props, S_OPEN, "Abrir plugin", vst3_open_clicked, data);
	return props;
}

bool obs_module_load(void)
{
	struct obs_source_info info = {};
	info.id = "vst3_filter";
	info.type = OBS_SOURCE_TYPE_FILTER;
	info.output_flags = OBS_SOURCE_AUDIO;
	info.get_name = vst3_name;
	info.create = vst3_create;
	info.destroy = vst3_destroy;
	info.update = vst3_update;
	info.save = vst3_save;
	info.filter_audio = vst3_filter_audio;
	info.get_properties = vst3_properties;
	obs_register_source(&info);
	return true;
}
