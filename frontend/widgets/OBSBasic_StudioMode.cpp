/******************************************************************************
    Copyright (C) 2023 by Lain Bailey <lain@obsproject.com>
                          Zachary Lund <admin@computerquip.com>
                          Philippe Groarke <philippe.groarke@gmail.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
******************************************************************************/

#include "OBSBasic.hpp"
#include "OBSProjector.hpp"

#include <utility/display-helpers.hpp>
#include <utility/QuickTransition.hpp>

#include <qt-wrappers.hpp>
#include <slider-ignorewheel.hpp>

#include <QToolTip>
#include <QGraphicsOpacityEffect>
#include <QPointer>
#include <QLayout>
#include "FreeMixCenterColumn.hpp"
#include <QSpinBox>
#include <QDockWidget>
#include <QDateTime>
#include <QMouseEvent>
#include <functional>

// UI-only sibling overlay: never registered as an OBS source or draw callback.
class ThreeMixMonitorIdentity final : public QObject {
	QPointer<QLabel> label;
	QPointer<QWidget> display;
	QGraphicsOpacityEffect *opacity;
	void place()
	{
		if (!label || !display) return;
		label->setGeometry(display->x(), display->y(),
			std::max(0, std::min(260, display->width())), 24);
		label->raise();
		// QGraphicsOpacityEffect caches the label's rendered pixmap. A re-layout
		// (dock resize, window move, Program re-entering Studio Mode) can leave a
		// stale cached frame showing through the freshly positioned one until
		// something else forces the effect to repaint - previously only a hover.
		// Invalidate on every reposition so two overlapping renders of "PGM"/"PVW"
		// never linger without the user having to mouse over the monitor first.
		if (opacity) opacity->update();
	}
protected:
	bool eventFilter(QObject *, QEvent *event) override
	{
		if (event->type() == QEvent::Hide && label) {
			label->setProperty("3mix.restoreIdentity", !label->isHidden());
			label->hide();
		}
		if (event->type() == QEvent::Show && label &&
		    label->property("3mix.restoreIdentity").toBool()) label->show();
		if (event->type() == QEvent::Resize || event->type() == QEvent::Move ||
		    event->type() == QEvent::Show) place();
		if (event->type() == QEvent::Enter || event->type() == QEvent::FocusIn)
			opacity->setOpacity(1.0);
		if (event->type() == QEvent::Leave || event->type() == QEvent::FocusOut)
			opacity->setOpacity(display && display->hasFocus() ? 1.0 : 0.55);
		return false;
	}
public:
	ThreeMixMonitorIdentity(QLabel *identity, QWidget *monitor)
		: QObject(identity), label(identity), display(monitor),
		  opacity(new QGraphicsOpacityEffect(identity))
	{
		if (identity->parentWidget() && identity->parentWidget()->layout())
			identity->parentWidget()->layout()->removeWidget(identity);
		identity->setParent(monitor->parentWidget());
		identity->setMinimumWidth(0);
		identity->setMaximumWidth(QWIDGETSIZE_MAX);
		// Scope and safe-area controls are real children of this label.
		identity->setAttribute(Qt::WA_TransparentForMouseEvents, false);
		identity->setGraphicsEffect(opacity);
		opacity->setOpacity(0.55);
		monitor->installEventFilter(this);
		place();
	}
};

class FreeMixClockLabel : public QLabel {
public:
	using QLabel::QLabel;
	std::function<void()> doubleClicked;

protected:
	void mouseDoubleClickEvent(QMouseEvent *event) override
	{
		if (doubleClicked)
			doubleClicked();
		QLabel::mouseDoubleClickEvent(event);
	}
};
#include <algorithm>



void OBSBasic::CreateProgramDisplay()
{
	program = new OBSQTDisplay();

	program->setContextMenuPolicy(Qt::CustomContextMenu);
	connect(program.data(), &QWidget::customContextMenuRequested, this, &OBSBasic::ProgramViewContextMenuRequested);

	auto displayResize = [this]() {
		struct obs_video_info ovi;

		if (obs_get_video_info(&ovi)) {
			ResizeProgram(ovi.base_width, ovi.base_height);
		}
	};

	connect(program.data(), &OBSQTDisplay::DisplayResized, this, displayResize);

	auto addDisplay = [this](OBSQTDisplay *window) {
		obs_display_add_draw_callback(window->GetDisplay(), OBSBasic::RenderProgram, this);

		struct obs_video_info ovi;
		if (obs_get_video_info(&ovi)) {
			ResizeProgram(ovi.base_width, ovi.base_height);
		}
	};

	connect(program.data(), &OBSQTDisplay::DisplayCreated, this, addDisplay);

	program->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Expanding);
}

#define T_BAR_PRECISION 1024
#define T_BAR_PRECISION_F ((float)T_BAR_PRECISION)
#define T_BAR_CLAMP (T_BAR_PRECISION / 10)

void OBSBasic::CreateProgramOptions()
{
	programOptions = new QWidget();
	programOptions->setObjectName("freemixTransitionColumn");
	programOptions->setStyleSheet(
		"QWidget#freemixTransitionColumn,QWidget#freemixSwitcherControls,"
		"QWidget#freemixOverlayButtons,QWidget#freemixDskHeader,QWidget#freemixTBarHolder{background:#202020;}"
		"QWidget#freemixSwitcherControls QPushButton{margin-left:0px;margin-right:0px;}");
	programOptions->setFixedWidth(392);
	programOptions->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Expanding);

	QHBoxLayout *centerLayout = new QHBoxLayout();
	centerLayout->setContentsMargins(0, 0, 0, 0);
	centerLayout->setSpacing(8);
	centerLayout->setAlignment(Qt::AlignTop | Qt::AlignHCenter);

	QWidget *controlsColumn = new QWidget(programOptions);
	controlsColumn->setObjectName("freemixSwitcherControls");
	controlsColumn->setFixedWidth(132);
	QVBoxLayout *layout = new QVBoxLayout(controlsColumn);
	layout->setContentsMargins(0, 0, 0, 0);
	layout->setSpacing(2);

	QPushButton *configTransitions = new QPushButton();
	configTransitions->setProperty("class", "icon-dots-vert");
	configTransitions->setFixedSize(22, 26);
	configTransitions->setStyleSheet("min-width:0px; padding:0px;");

	QHBoxLayout *mainButtonLayout = new QHBoxLayout();
	mainButtonLayout->setSpacing(2);

	transitionButton = new QPushButton("AUTO");
	transitionButton->setStyleSheet("min-width:0px; padding:0px 2px; font-size:11px;");
	transitionButton->setFixedHeight(26);
	transitionButton->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);

	// Hidden transition buttons still need an owner for mode toggles and shutdown.
	auto *quickTransitionsHolder = new QWidget(controlsColumn);
	quickTransitionsHolder->hide();
	QVBoxLayout *quickTransitionsLayout = new QVBoxLayout(quickTransitionsHolder);
	quickTransitionsLayout->setSpacing(2);
	// Quick transitions stay in this hidden layout: the visible column follows
	// the mockup (CUT/AUTO, duration and T-Bar only).
	programTransitionsLayout = quickTransitionsLayout;

	QPushButton *addQuickTransition = new QPushButton();
	addQuickTransition->setProperty("class", "icon-plus");
	addQuickTransition->setFixedSize(24, 24);
	addQuickTransition->setStyleSheet("min-width:0px; padding:0px;");

	QLabel *quickTransitionsLabel = new QLabel("TRANSIÇÃO");
	quickTransitionsLabel->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);

	quickTransitionsLayout->addWidget(quickTransitionsLabel);
	quickTransitionsLayout->addWidget(addQuickTransition);

	mainButtonLayout->addWidget(transitionButton);
	mainButtonLayout->addWidget(configTransitions);
	mainButtonLayout->addWidget(addQuickTransition);
	auto *cutButton = new QPushButton("CUT", controlsColumn);
	cutButton->setFixedHeight(30);
	cutButton->setObjectName("freemixCutButton");
	connect(cutButton, &QPushButton::clicked, this, [this]() {
		if (!IsPreviewProgramMode()) return;
		OBSSourceAutoRelease cut = obs_source_create_private("cut_transition", "3Mix CUT", nullptr);
		if (!cut) return;
		OverrideTransition(cut.Get());
		overridingTransition = true;
		TransitionToScene(GetCurrentSceneSource(), false, true, 0, false);
	});

	tBar = new SliderIgnoreClick(Qt::Vertical);
	tBar->setMinimumHeight(80);
	/* Compact column: the T-Bar never takes the room of the clock and the talkback. */
	tBar->setMaximumHeight(QWIDGETSIZE_MAX);
	tBar->setFixedWidth(28);
	tBar->setMinimum(0);
	tBar->setMaximum(T_BAR_PRECISION - 1);

	tBar->setProperty("class", "slider-tbar");

	connect(tBar, &QSlider::valueChanged, this, &OBSBasic::TBarChanged);
	connect(tBar, &QSlider::sliderReleased, this, &OBSBasic::TBarReleased);

	layout->addWidget(cutButton);
	layout->addLayout(mainButtonLayout);
	auto *durationSpin = new QSpinBox(controlsColumn);
	durationSpin->setFixedWidth(132);
	durationSpin->setObjectName("freemixTransitionDuration");
	durationSpin->setRange(50, 2000);
	durationSpin->setSingleStep(50);
	durationSpin->setSuffix(" ms");
	durationSpin->setPrefix("Dur. ");
	const int transitionDuration = GetTransitionDuration();
	durationSpin->setValue(transitionDuration >= 50 && transitionDuration <= 2000 ? transitionDuration : 500);
	durationSpin->setToolTip("Duração da transição usada por AUTO, T-Bar e pelos DSK configurados para acompanhar a transição da mesa.");
	connect(durationSpin, QOverload<int>::of(&QSpinBox::valueChanged), this, [this](int value) {
		SetTransitionDuration(value);
	});
	layout->addWidget(durationSpin);
	/* The holder centers the T-Bar in the controls column and gives it the free vertical space, so the
	 * clock keeps its square and the talkback sits at the base of the column. */
	auto *tBarHolder = new QWidget(controlsColumn);
	tBarHolder->setObjectName("freemixTBarHolder");
	tBarHolder->setMinimumHeight(80);
	tBarHolder->setMaximumHeight(QWIDGETSIZE_MAX);
	auto *tBarLayout = new QHBoxLayout(tBarHolder);
	tBarLayout->setContentsMargins(0, 0, 0, 0);
	tBarLayout->setSpacing(0);
	tBarLayout->addStretch(1);
	tBarLayout->addWidget(tBar);
	tBarLayout->addStretch(1);
	layout->addWidget(tBarHolder, 1);
	// Production clock and the momentary private talkback stay under the T-Bar.
	// Native widgets only: the CEF clock widget corrupted the heap in this column.
	auto *centerClock = new FreeMixClockLabel(controlsColumn);
	centerClock->setObjectName("freemixCenterClock");
	centerClock->setAlignment(Qt::AlignCenter);
	centerClock->setFixedHeight(132);
	centerClock->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
	centerClock->setTextFormat(Qt::RichText);
	centerClock->setCursor(Qt::PointingHandCursor);
	centerClock->setToolTip("Duplo clique: escolher quais relógios aparecem aqui.");
	centerClock->setStyleSheet("background:#202020;border:1px solid #383838;padding:2px;");
	centerClock->doubleClicked = []() { FreeMixOpenClocks(); };
	layout->addWidget(centerClock);

	auto *centerTalk = new QPushButton("Talkback", controlsColumn);
	centerTalk->setObjectName("freemixCenterTalkback");
	centerTalk->setFixedHeight(28);
	centerTalk->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
	centerTalk->setToolTip("Segure para falar no microfone privado preparado em Calls. Soltar fecha o microfone.");
	centerTalk->setEnabled(false);
	centerTalk->setStyleSheet("font-size:11px;padding:0;");
	layout->addWidget(centerTalk);
	// The T-Bar holder owns spare height; clocks and Talkback stay at the
	// bottom instead of leaving an unused stretch beneath the controls.

	auto *centerTimer = new QTimer(controlsColumn);
	connect(centerTimer, &QTimer::timeout, controlsColumn, [centerClock, centerTalk]() {
		centerClock->setText(FreeMixCenterClockHtml());
		const bool active = FreeMixTalkbackActive();
		centerTalk->setEnabled(FreeMixTalkbackReady());
		if (centerTalk->property("talking").toBool() != active) {
			centerTalk->setProperty("talking", active);
			centerTalk->setText(active ? "FALANDO" : "Talkback");
			centerTalk->setStyleSheet(active ? "font-size:10px;padding:0;background:#a11;color:#fff;"
							 : "font-size:10px;padding:0;");
		}
	});
	centerTimer->start(500);
	connect(centerTalk, &QPushButton::pressed, this, []() { FreeMixTalkbackPress(true); });
	connect(centerTalk, &QPushButton::released, this, []() { FreeMixTalkbackPress(false); });
	auto *talkKeepAlive = new QTimer(centerTalk);
	talkKeepAlive->setInterval(500);
	connect(talkKeepAlive, &QTimer::timeout, centerTalk, []() { FreeMixTalkbackKeepAlive(); });
	connect(centerTalk, &QPushButton::pressed, talkKeepAlive, [talkKeepAlive]() { talkKeepAlive->start(); });
	connect(centerTalk, &QPushButton::released, talkKeepAlive, [talkKeepAlive]() { talkKeepAlive->stop(); });

	// Two extra quick transitions from the mockup: MERGE and STINGER.
	// They trigger the project's real quick transitions, not a fake animation.
	auto *quickRow = new QHBoxLayout();
	quickRow->setSpacing(2);
	auto *mergeButton = new QPushButton("MERGE", controlsColumn);
	auto *stingerButton = new QPushButton("STINGER", controlsColumn);
	for (auto *button : {mergeButton, stingerButton}) {
		button->setFixedHeight(23);
		button->setStyleSheet("font-size:9px; padding:0px;");
	}
	mergeButton->setObjectName("freemixQuickMerge");
	stingerButton->setObjectName("freemixQuickStinger");
	mergeButton->setToolTip("Transição rápida Merge deste projeto");
	stingerButton->setToolTip("Transição rápida Stinger deste projeto");
	connect(mergeButton, &QPushButton::clicked, this, [this]() {
		for (QuickTransition &qt : quickTransitions) {
			if (!qt.source || qt.fadeToBlack) continue;
			const char *name = obs_source_get_name(qt.source);
			if (name && QString::fromUtf8(name).contains("merge", Qt::CaseInsensitive)) {
				TriggerQuickTransition(qt.id);
				return;
			}
		}
	});
	connect(stingerButton, &QPushButton::clicked, this, [this]() {
		for (QuickTransition &qt : quickTransitions) {
			if (!qt.source || qt.fadeToBlack) continue;
			if (strcmp(obs_source_get_id(qt.source), "stinger_transition") == 0) {
				TriggerQuickTransition(qt.id);
				return;
			}
		}
	});
	auto *quickTimer = new QTimer(controlsColumn);
	quickTimer->setInterval(1200);
	connect(quickTimer, &QTimer::timeout, controlsColumn, [this, mergeButton, stingerButton]() {
		bool merge = false, stinger = false;
		for (QuickTransition &qt : quickTransitions) {
			if (!qt.source || qt.fadeToBlack) continue;
			const char *name = obs_source_get_name(qt.source);
			if (name && QString::fromUtf8(name).contains("merge", Qt::CaseInsensitive)) merge = true;
			if (strcmp(obs_source_get_id(qt.source), "stinger_transition") == 0) stinger = true;
		}
		mergeButton->setEnabled(merge);
		stingerButton->setEnabled(stinger);
	});
	quickTimer->start();
	mergeButton->setEnabled(false);
	stingerButton->setEnabled(false);
	quickRow->addWidget(mergeButton);
	quickRow->addWidget(stingerButton);
	layout->insertLayout(2, quickRow);

	// Restore the visible FTB control using the native quick-transition path.
	auto *ftbButton = new QPushButton("FTB", controlsColumn);
	ftbButton->setObjectName("threeMixFadeToBlack");
	ftbButton->setCheckable(true);
	ftbButton->setFixedHeight(26);
	ftbButton->setToolTip("Fade to Black — apagar/restaurar Programa pela transição FTB do projeto");
	connect(ftbButton, &QPushButton::clicked, this, [this]() {
		for (const QuickTransition &qt : quickTransitions) {
			if (qt.fadeToBlack && qt.source) {
				TriggerQuickTransition(qt.id);
				return;
			}
		}
	});
	connect(quickTimer, &QTimer::timeout, ftbButton, [this, ftbButton]() {
		bool available = false;
		for (const QuickTransition &qt : quickTransitions)
			if (qt.fadeToBlack && qt.source) available = true;
		ftbButton->setEnabled(available);
		ftbButton->setChecked(bool(prevFTBSource));
	});
	ftbButton->setEnabled(false);
	layout->insertWidget(layout->indexOf(centerClock), ftbButton);

	masterMeter = FreeMixCreateMasterMeter(programOptions);

	centerLayout->addWidget(controlsColumn);
	centerLayout->addWidget(FreeMixCreateOverlayButtons(programOptions), 1);
	if (auto *dskColumn = programOptions->findChild<QWidget *>("freemixOverlayButtons"))
		FreeMixDskBindBottomLine(dskColumn, centerTalk);
	centerLayout->addWidget(masterMeter);

	programOptions->setLayout(centerLayout);
	if (!ui->previewLabel->property("3mix.monitorOverlay").toBool()) {
		new ThreeMixMonitorIdentity(ui->previewLabel, ui->preview);
		ui->previewLabel->setProperty("3mix.monitorOverlay", true);
	}

	// Keep the monitor row at the production aspect: the empty bands above and
	// below Preview/Program come from a central area taller than 16:9.
	auto *fitTimer = new QTimer(this);
	fitTimer->setSingleShot(true);
	fitTimer->setInterval(180);
	connect(ui->preview, &OBSQTDisplay::DisplayResized, fitTimer, [fitTimer]() { fitTimer->start(); });
	connect(fitTimer, &QTimer::timeout, this, [this]() {
		if (!previewProgramMode || !isVisible() || isMinimized() || property("freemixFitting").toBool()) return;
		QDockWidget *dock = nullptr;
		for (auto *candidate : findChildren<QDockWidget *>()) {
			if (candidate->property("3mix.componentId").toString() == "3mix.mesa") {
				dock = candidate;
				break;
			}
		}
		if (!dock || !dock->isVisible() || ui->preview->width() < 320) return;
		// Reserve an operable lower desk at compact window heights. Video
		// remains aspect-fitted by the display renderer, never stretched.
		const int deskReserve = height() < 850 ? 300 : 360;
		const int aspectHeight = qRound(ui->preview->width() * 9.0 / 16.0) + 4;
		const int desired = std::min(aspectHeight, std::max(280, height() - deskReserve - 40));
		const int central = centralWidget() ? centralWidget()->height() : 0;
		const int extra = central - desired;
		if (qEnvironmentVariableIntValue("THREEMIX_QA_INTEGRATED_TITLEBAR") == 1)
			blog(LOG_INFO, "[3Mix layout QA] window=%dx%d preview=%dx%d central=%d desired=%d dock=%d min=%d columnMin=%d",
			     width(), height(), ui->preview->width(), ui->preview->height(), central, desired,
			     dock->height(), dock->minimumSizeHint().height(),
			     programOptions ? programOptions->minimumSizeHint().height() : -1);
		if (extra <= 10) return;
		int target = std::min(height() - 180, dock->height() + extra);
		if (target <= dock->height() + 10) return;
		setProperty("freemixFitting", true);
		resizeDocks({dock}, {target}, Qt::Vertical);
		QTimer::singleShot(350, this, [this]() { setProperty("freemixFitting", false); });
	});
	fitTimer->start();

	auto onAdd = [this]() {
		QScopedPointer<QMenu> menu(CreateTransitionMenu(this, nullptr));
		menu->exec(QCursor::pos());
	};

	auto onConfig = [this]() {
		QMenu menu(this);
		QAction *action;

		auto toggleEditProperties = [this]() {
			editPropertiesMode = !editPropertiesMode;

			OBSSource actualScene = OBSGetStrongRef(programScene);
			if (actualScene) {
				TransitionToScene(actualScene, true);
			}
		};

		auto toggleSwapScenesMode = [this]() {
			swapScenesMode = !swapScenesMode;
		};

		auto toggleSceneDuplication = [this]() {
			sceneDuplicationMode = !sceneDuplicationMode;

			OBSSource actualScene = OBSGetStrongRef(programScene);
			if (actualScene) {
				TransitionToScene(actualScene, true);
			}
		};

		auto showToolTip = [&]() {
			QAction *act = menu.activeAction();
			QToolTip::showText(QCursor::pos(), act->toolTip(), &menu, menu.actionGeometry(act));
		};

		action = menu.addAction(QTStr("QuickTransitions.DuplicateScene"));
		action->setToolTip(QTStr("QuickTransitions.DuplicateSceneTT"));
		action->setCheckable(true);
		action->setChecked(sceneDuplicationMode);
		connect(action, &QAction::triggered, this, toggleSceneDuplication);
		connect(action, &QAction::hovered, action, showToolTip);

		action = menu.addAction(QTStr("QuickTransitions.EditProperties"));
		action->setToolTip(QTStr("QuickTransitions.EditPropertiesTT"));
		action->setCheckable(true);
		action->setChecked(editPropertiesMode);
		action->setEnabled(sceneDuplicationMode);
		connect(action, &QAction::triggered, this, toggleEditProperties);
		connect(action, &QAction::hovered, action, showToolTip);

		action = menu.addAction(QTStr("QuickTransitions.SwapScenes"));
		action->setToolTip(QTStr("QuickTransitions.SwapScenesTT"));
		action->setCheckable(true);
		action->setChecked(swapScenesMode);
		connect(action, &QAction::triggered, this, toggleSwapScenesMode);
		connect(action, &QAction::hovered, action, showToolTip);

		menu.exec(QCursor::pos());
	};

	connect(transitionButton.data(), &QAbstractButton::clicked, this, &OBSBasic::TransitionClicked);
	connect(addQuickTransition, &QAbstractButton::clicked, this, onAdd);
	connect(configTransitions, &QAbstractButton::clicked, this, onConfig);
}

void OBSBasic::TogglePreviewProgramMode()
{
	SetPreviewProgramMode(!IsPreviewProgramMode());
}

void OBSBasic::SetPreviewProgramMode(bool enabled)
{
	if (IsPreviewProgramMode() == enabled) {
		return;
	}

	os_atomic_set_bool(&previewProgramMode, enabled);
	emit PreviewProgramModeChanged(enabled);

	if (IsPreviewProgramMode()) {
		if (!previewEnabled) {
			EnablePreviewDisplay(true);
		}

		CreateProgramDisplay();
		CreateProgramOptions();

		OBSScene curScene = GetCurrentScene();

		OBSSceneAutoRelease dup;
		if (sceneDuplicationMode) {
			dup = obs_scene_duplicate(curScene, obs_source_get_name(obs_scene_get_source(curScene)),
						  editPropertiesMode ? OBS_SCENE_DUP_PRIVATE_COPY
								     : OBS_SCENE_DUP_PRIVATE_REFS);
		} else {
			dup = std::move(OBSScene(curScene));
		}

		OBSSourceAutoRelease transition = obs_get_output_source(0);
		obs_source_t *dup_source = obs_scene_get_source(dup);
		obs_transition_set(transition, dup_source);

		if (curScene) {
			obs_source_t *source = obs_scene_get_source(curScene);
			obs_source_inc_showing(source);
			lastScene = OBSGetWeakRef(source);
			programScene = OBSGetWeakRef(source);
		}

		RefreshQuickTransitions();

		programLabel = new QLabel(QTStr("StudioMode.ProgramSceneLabel"), this);
		programLabel->setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Preferred);
		programLabel->setProperty("class", "label-preview-title");

		programWidget = new QWidget();
		programLayout = new QVBoxLayout();
		programLayout->setContentsMargins(0, 0, 0, 0);
		programLayout->setSpacing(0);

		programLayout->addWidget(program);

		programWidget->setLayout(programLayout);
		new ThreeMixMonitorIdentity(programLabel, program);

		ui->previewLayout->addWidget(programOptions);
		ui->previewLayout->addWidget(programWidget);
		ui->previewLayout->setAlignment(programOptions, Qt::AlignTop);

		sizeObserver = new PreviewProgramSizeObserver(ui->preview, program, this);

		// programLabel was just constructed with the raw "StudioMode.ProgramSceneLabel"
		// lookup key as its text (that locale key does not exist; TextLookup::GetString
		// returns the key itself when a lookup misses - see libobs/util/util.hpp). Nothing
		// before this point replaces that text with the compact "PGM" the user is meant to
		// see: UpdatePreviewProgramIndicators() only runs later, off a scene/transition
		// event. With the opacity effect attached above, that stale first paint could be
		// cached and linger - visually indistinguishable from the label being duplicated -
		// until a hover forced a repaint. Apply the real indicator text up front instead.
		UpdatePreviewProgramIndicators();

		OnEvent(OBS_FRONTEND_EVENT_STUDIO_MODE_ENABLED);

		blog(LOG_INFO, "Switched to Preview/Program mode");
		blog(LOG_INFO, "-----------------------------"
			       "-------------------");
	} else {
		OBSSource actualProgramScene = OBSGetStrongRef(programScene);
		if (!actualProgramScene) {
			actualProgramScene = GetCurrentSceneSource();
		} else {
			SetCurrentScene(actualProgramScene, true);
		}
		TransitionToScene(actualProgramScene, true);

		delete programOptions;
		delete program;
		delete programLabel;
		delete programWidget;
		sizeObserver->deleteLater();

		if (lastScene) {
			OBSSource actualLastScene = OBSGetStrongRef(lastScene);
			if (actualLastScene) {
				obs_source_dec_showing(actualLastScene);
			}
			lastScene = nullptr;
		}

		programScene = nullptr;
		swapScene = nullptr;
		prevFTBSource = nullptr;

		for (QuickTransition &qt : quickTransitions) {
			qt.button = nullptr;
		}

		if (!previewEnabled) {
			EnablePreviewDisplay(false);
		}

		ui->transitions->setEnabled(true);
		tBarActive = false;

		OnEvent(OBS_FRONTEND_EVENT_STUDIO_MODE_DISABLED);

		blog(LOG_INFO, "Switched to regular Preview mode");
		blog(LOG_INFO, "-----------------------------"
			       "-------------------");
	}

	ResetUI();
	UpdateTitleBar();
}

void OBSBasic::RenderProgram(void *data, uint32_t, uint32_t)
{
	GS_DEBUG_MARKER_BEGIN(GS_DEBUG_COLOR_DEFAULT, "RenderProgram");

	OBSBasic *window = static_cast<OBSBasic *>(data);
	obs_video_info ovi;

	obs_get_video_info(&ovi);

	window->programCX = int(window->programScale * float(ovi.base_width));
	window->programCY = int(window->programScale * float(ovi.base_height));

	gs_viewport_push();
	gs_projection_push();

	/* --------------------------------------- */

	gs_ortho(0.0f, float(ovi.base_width), 0.0f, float(ovi.base_height), -100.0f, 100.0f);
	gs_set_viewport(window->programX, window->programY, window->programCX, window->programCY);

	obs_render_main_texture_src_color_only();
	gs_load_vertexbuffer(nullptr);

	/* --------------------------------------- */

	gs_projection_pop();
	gs_viewport_pop();

	GS_DEBUG_MARKER_END();
}

void OBSBasic::ResizeProgram(uint32_t cx, uint32_t cy)
{
	QSize targetSize;

	/* resize program panel to fix to the top section of the window */
	targetSize = GetPixelSize(program);
	const int edge = qEnvironmentVariableIntValue("THREEMIX_QA_INTEGRATED_TITLEBAR") == 1 ? 0 : PREVIEW_EDGE_SIZE;
	GetScaleAndCenterPos(int(cx), int(cy), targetSize.width() - edge * 2,
			     targetSize.height() - edge * 2, programX, programY, programScale);

	programX += float(edge);
	programY += float(edge);
}

void OBSBasic::UpdatePreviewProgramIndicators()
{
	bool labels = previewProgramMode ? config_get_bool(App()->GetUserConfig(), "BasicWindow", "StudioModeLabels")
					 : false;

	ui->previewLabel->setVisible(labels);

	if (programLabel) {
		programLabel->setVisible(labels);
	}

	if (!labels) {
		return;
	}

	QString preview =
		QTStr("StudioMode.PreviewSceneName").arg(QT_UTF8(obs_source_get_name(GetCurrentSceneSource())));

	QString program = QTStr("StudioMode.ProgramSceneName").arg(QT_UTF8(obs_source_get_name(GetProgramSource())));

	const auto compactIndicator = [](QLabel *label, const QString &description, const char *text, const char *accent) {
		if (!label) return;
		label->setToolTip(description);
		label->setAccessibleName(description);
		label->setText(text);
		label->setStyleSheet(QString("background:#202020;color:#ededed;border:0;"
			"border-left:3px solid %1;padding:2px 7px;font-weight:600;").arg(accent));
		label->setMinimumHeight(0);
		label->setMaximumHeight(24);
		// ThreeMixMonitorIdentity keeps a QGraphicsOpacityEffect permanently attached for the
		// hover fade (0.55 at rest, 1.0 on Enter/FocusIn). That effect caches the label's last
		// rendered pixmap; setText()/setStyleSheet() alone do not reliably invalidate it, which
		// left the previous text ("PGM"'s own prior paint, or the raw "StudioMode.ProgramSceneLabel"
		// locale key on first paint before this function first ran) ghosted under the new one
		// until a hover forced the opacity to change and repainted it clean. Force the same
		// invalidation here, every time the text changes, instead of only on hover.
		if (auto *effect = label->graphicsEffect())
			effect->update();
	};
	compactIndicator(ui->previewLabel, preview, "PVW", "#39d349");
	compactIndicator(programLabel, program, "PGM", "#f53038");
}

OBSSource OBSBasic::GetProgramSource()
{
	return OBSGetStrongRef(programScene);
}

void OBSBasic::ProgramViewContextMenuRequested()
{
	QMenu popup(this);
	QPointer<QMenu> studioProgramProjector;

	studioProgramProjector = new QMenu(QTStr("Projector.Open.Program"));
	AddProjectorMenuMonitors(studioProgramProjector, this, &OBSBasic::OpenStudioProgramProjector);
	studioProgramProjector->addSeparator();
	studioProgramProjector->addAction(QTStr("Projector.Window"), this, &OBSBasic::OpenStudioProgramWindow);

	popup.addMenu(studioProgramProjector);

	popup.addSeparator();
	popup.addAction(QTStr("Screenshot.StudioProgram"), this, &OBSBasic::ScreenshotProgram);

	popup.exec(QCursor::pos());
}

void OBSBasic::EnablePreviewProgram()
{
	SetPreviewProgramMode(true);
}

void OBSBasic::DisablePreviewProgram()
{
	SetPreviewProgramMode(false);
}

void OBSBasic::OpenStudioProgramProjector()
{
	int monitor = sender()->property("monitor").toInt();
	OpenProjector(nullptr, monitor, ProjectorType::StudioProgram);
}

void OBSBasic::OpenStudioProgramWindow()
{
	OpenProjector(nullptr, -1, ProjectorType::StudioProgram);
}
