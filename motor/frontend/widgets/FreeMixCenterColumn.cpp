/******************************************************************************
    FreeMix: what the column between Preview and Output has besides the transitions.

    Overlay buttons 1 to 8. Each overlay channel is a keyer of the Downstream Keyer component named "1" to "8"
    (the same ones the input tiles use). A button is lit while its channel is on air. A click does what the
    reference calls OverlayInput: if the channel shows the Preview input it goes off, otherwise the Preview input
    goes on it. The right button menu takes the channel off whatever it shows.

    Master meter. Peak level of output track 1, which is where the Master bus ends, read from the audio mix
    itself, so it shows what is recorded and streamed.

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

#include "FreeMixCenterColumn.hpp"
#include "OBSBasic.hpp"

#include <obs.hpp>
#include <obs-frontend-api.h>
#include <qt-wrappers.hpp>

#include "../../plugins/obs-websocket/lib/obs-websocket-api.h"

#include <QGridLayout>
#include <QHBoxLayout>
#include <QMenu>
#include <QPainter>
#include <QPointer>
#include <QPushButton>
#include <QPixmap>
#include <QResizeEvent>
#include <QTimer>
#include <QCoreApplication>
#include <QDir>
#include <QUrl>
#include <QLabel>
#include <QDateTime>
#include <QTime>
#include <QFontMetrics>
#include <QStringList>
#ifdef BROWSER_AVAILABLE
#include <docks/BrowserDock.hpp>
#endif

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <string>
#include <vector>

namespace {

constexpr int kOverlayCount = 8;
/* Time the exit animation of a title takes; the same wait the input tiles use. */
constexpr int kTitleExitMs = 550;

/* The DSK strip keeps one line of title and eight compact rows. The height the expand button used to
 * take stays free instead of making the central column taller: the rows never grow past 46 px. */
constexpr int kDskHeaderHeight = 26;
constexpr int kDskSpacing = 3;
constexpr int kDskMinRowHeight = 38;
constexpr int kDskMaxRowHeight = 51;
constexpr int kDskNumberWidth = 32;
constexpr int kDskMinNameWidth = 64;

/* Calls a request of another component through the control server. Null when there is no answer. */
OBSDataAutoRelease CallVendor(const char *vendorName, const char *requestType, obs_data_t *requestData)
{
	OBSDataAutoRelease request = obs_data_create();
	obs_data_set_string(request, "vendorName", vendorName);
	obs_data_set_string(request, "requestType", requestType);
	if (requestData) {
		obs_data_set_obj(request, "requestData", requestData);
	}

	obs_websocket_request_response *response = obs_websocket_call_request("CallVendorRequest", request);
	if (!response) {
		return nullptr;
	}

	OBSDataAutoRelease result;
	if (response->response_data) {
		OBSDataAutoRelease all = obs_data_create_from_json(response->response_data);
		if (all) {
			result = obs_data_get_obj(all, "responseData");
		}
	}
	obs_websocket_request_response_free(response);
	return result;
}

OBSDataAutoRelease CallKeyer(const char *requestType, int channel, const char *scene, bool immediate = false)
{
	OBSDataAutoRelease data = obs_data_create();
	obs_data_set_string(data, "dsk_name", std::to_string(channel).c_str());
	obs_data_set_bool(data, "immediate", immediate);
	if (scene) {
		obs_data_set_string(data, "scene", scene);
	}
	return CallVendor("downstream-keyer", requestType, data);
}

/* Asks the titles of an input (pages of the title gallery) to play their exit. True if there was any. */
bool AskTitlesToLeave(const std::string &sceneName)
{
	OBSSourceAutoRelease source = obs_get_source_by_name(sceneName.c_str());
	obs_scene_t *scene = obs_scene_from_source(source);
	if (!scene) {
		return false;
	}

	std::vector<std::string> titles;
	obs_scene_enum_items(
		scene,
		[](obs_scene_t *, obs_sceneitem_t *item, void *param) {
			obs_source_t *itemSource = obs_sceneitem_get_source(item);
			if (strcmp(obs_source_get_unversioned_id(itemSource), "browser_source") == 0) {
				OBSDataAutoRelease settings = obs_source_get_settings(itemSource);
				if (strstr(obs_data_get_string(settings, "url"), "/gc/")) {
					static_cast<std::vector<std::string> *>(param)->push_back(
						obs_source_get_name(itemSource));
				}
			}
			return true;
		},
		&titles);

	for (const std::string &title : titles) {
		OBSDataAutoRelease eventData = obs_data_create();
		obs_data_set_string(eventData, "name", title.c_str());
		obs_data_set_bool(eventData, "show", false);
		OBSDataAutoRelease data = obs_data_create();
		obs_data_set_string(data, "event_name", "freemix-gc");
		obs_data_set_obj(data, "event_data", eventData);
		CallVendor("obs-browser", "emit_event", data);
	}
	return !titles.empty();
}

class OverlayButtons : public QWidget {
public:
	explicit OverlayButtons(QWidget *parent) : QWidget(parent)
	{
		setObjectName("freemixOverlayButtons");
		setMinimumWidth(220);
		theInstance = this;

		QGridLayout *grid = new QGridLayout(this);
		grid->setContentsMargins(10, 0, 0, 0);
		grid->setHorizontalSpacing(kDskSpacing);
		grid->setVerticalSpacing(kDskSpacing);
		grid->setColumnStretch(2, 1);
		grid->setAlignment(Qt::AlignTop);
		/* The row heights follow the column: never let the fixed thumbnails impose a minimum height
		 * on the central area, which would push the window or squeeze the Preview/Program displays. */
		grid->setSizeConstraint(QLayout::SetNoConstraint);

		/* Title and the expand button share the first line: the row that used to hold only the arrow
		 * under the channel list is gone, and its height went to the thumbnails. */
		auto *header = new QWidget(this);
		header->setObjectName("freemixDskHeader");
		header->setFixedHeight(kDskHeaderHeight);
		header->setStyleSheet("background:#242424;border-bottom:1px solid #39424c;");
		auto *headerLayout = new QHBoxLayout(header);
		headerLayout->setContentsMargins(2, 0, 0, 0);
		headerLayout->setSpacing(4);
		auto *heading = new QLabel("DSK", header);
		heading->setObjectName("freemixDskHeading");
		heading->setStyleSheet("font-size:13px;font-weight:700;color:#e8eef4;background:transparent;");
		auto *manage = new QPushButton("↗", header);
		manage->setObjectName("freemixDskExpand");
		manage->setToolTip("Expandir DSK");
		manage->setAccessibleName("Expandir DSK");
		manage->setCursor(Qt::PointingHandCursor);
		manage->setFocusPolicy(Qt::NoFocus);
		manage->setFixedSize(22, 22);
		manage->setStyleSheet("QPushButton{font-size:14px;padding:0;background:transparent;"
				      "border:1px solid transparent;border-radius:3px;color:#c8d4df;}"
				      "QPushButton:hover{background:#333c46;border-color:#4a5663;}");
		headerLayout->addWidget(heading);
		headerLayout->addStretch(1);
		headerLayout->addWidget(manage);
		grid->addWidget(header, 0, 0, 1, 3);
		connect(manage, &QPushButton::clicked, this, []() {
			OBSDataAutoRelease data = obs_data_create();
			OBSDataAutoRelease eventData = obs_data_create();
			OBSDataAutoRelease freemix = obs_data_create();
			obs_data_set_string(freemix, "do", "dsktab");
			obs_data_set_obj(eventData, "freemix", freemix);
			obs_data_set_obj(data, "eventData", eventData);
			obs_websocket_call_request("BroadcastCustomEvent", data);
		});

		for (int i = 0; i < kOverlayCount; i++) {
			QPushButton *button = new QPushButton(QString::number(i + 1), this);
			/* No "freemix-overlay" class: its theme rule pins a 22 px minimum and lets the layout
			 * shrink the number to the text. The row button is a real 32 px wide full-height key. */
			button->setFocusPolicy(Qt::NoFocus);
			button->setContextMenuPolicy(Qt::CustomContextMenu);
			button->setFixedSize(kDskNumberWidth, kDskMinRowHeight);
			button->setStyleSheet("font-size:14px; font-weight:700; padding:0px;");
			auto *preview = new QLabel(this);
			preview->setObjectName("freemixDskPreview");
			preview->setFixedSize(82, kDskMaxRowHeight);
			preview->setAlignment(Qt::AlignCenter);
			preview->setStyleSheet("background:#11161b;border:1px solid #4a4a4a;border-radius:3px;");
			auto *nameLabel = new QLabel(this);
			nameLabel->setObjectName("freemixDskName");
			nameLabel->setMinimumWidth(kDskMinNameWidth);
			nameLabel->setFixedHeight(kDskMaxRowHeight);
			nameLabel->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Fixed);
			nameLabel->setAlignment(Qt::AlignLeft | Qt::AlignVCenter);
			nameLabel->setStyleSheet("font-size:11px;padding-left:2px;color:#93a1af;");
			grid->addWidget(button, i + 1, 0);
			grid->addWidget(preview, i + 1, 1);
			grid->addWidget(nameLabel, i + 1, 2);
			previews[i] = preview;
			names[i] = nameLabel;
			buttons[i] = button;
			connect(button, &QPushButton::clicked, this, [this, i]() { Toggle(i, true); });
			connect(button, &QWidget::customContextMenuRequested, this,
				[this, i](const QPoint &pos) { ShowMenu(i, buttons[i]->mapToGlobal(pos)); });
		}

		ApplyRowMetrics();
		QTimer *timer = new QTimer(this);
		connect(timer, &QTimer::timeout, this, [this]() { Refresh(); });
		timer->start(500);
		Refresh();
	}

protected:
	void resizeEvent(QResizeEvent *event) override
	{
		QWidget::resizeEvent(event);
		ApplyRowMetrics();
	}

private:
	std::array<QPushButton *, kOverlayCount> buttons{};
	std::array<QLabel *, kOverlayCount> previews{};
	std::array<QLabel *, kOverlayCount> names{};
	std::array<std::string, kOverlayCount> assigned{};
	std::array<std::string, kOverlayCount> scenes;
	std::array<bool, kOverlayCount> present{};
	QPointer<QWidget> bottomLineOf;
	int rowHeight = 0;
	int previewWidth = 0;
	/* There is exactly one center column: the free function binds the Talkback to this instance. */
	inline static OverlayButtons *theInstance = nullptr;

public:
	/* Bottom line of the column: the last row must finish exactly where the Talkback
	 * button ends, so the strip never runs below (or above) the controls stack. */
	void SetBottomLineWidget(QWidget *talk) { bottomLineOf = talk; }
	static void BindBottomLine(QWidget *talk)
	{
		if (theInstance)
			theInstance->SetBottomLineWidget(talk);
	}

private:
	/* The eight rows stay compact: each row takes exactly (bottomLine - header) / 8 so the last
	 * square finishes on the same line as the Talkback button. Falls back to the widget height
	 * when the Talkback is not on screen, and back to the 51 px row cap when the column is tall. */
	void ApplyRowMetrics()
	{
		int clientBottom = height();
		if (bottomLineOf && bottomLineOf->isVisible()) {
			const QPoint talkBottom = bottomLineOf->mapToGlobal(QPoint(0, bottomLineOf->height()));
			const QPoint selfTop = mapToGlobal(QPoint(0, 0));
			const int aligned = talkBottom.y() - selfTop.y();
			if (aligned > 0 && aligned < clientBottom)
				clientBottom = aligned;
		}

		const int freeHeight = clientBottom - kDskHeaderHeight - kDskSpacing * (kOverlayCount - 1);
		int nextRowHeight = freeHeight > 0 ? freeHeight / kOverlayCount : kDskMinRowHeight;
		nextRowHeight = std::clamp(nextRowHeight, kDskMinRowHeight, kDskMaxRowHeight);

		int nextPreviewWidth = nextRowHeight * 16 / 9;
		const int widestPreview = width() - kDskNumberWidth - kDskMinNameWidth - 2 * kDskSpacing;
		if (nextPreviewWidth > widestPreview) {
			nextPreviewWidth = std::max(64, widestPreview);
			nextRowHeight = std::clamp(nextPreviewWidth * 9 / 16, kDskMinRowHeight, kDskMaxRowHeight);
		}

		if (nextRowHeight == rowHeight && nextPreviewWidth == previewWidth) {
			return;
		}
		rowHeight = nextRowHeight;
		previewWidth = nextPreviewWidth;

		for (int i = 0; i < kOverlayCount; i++) {
			buttons[i]->setFixedSize(kDskNumberWidth, rowHeight);
			previews[i]->setFixedSize(previewWidth, rowHeight);
			names[i]->setFixedHeight(rowHeight);
		}
	}

	/* Which keyers exist changes rarely and is the expensive question: asked every few refreshes. */
	int refreshesUntilPresence = 0;

	void RefreshPresence()
	{
		present.fill(false);

		OBSDataAutoRelease answer = CallVendor("downstream-keyer", "get_downstream_keyers", nullptr);
		OBSDataArrayAutoRelease keyers = answer ? obs_data_get_array(answer, "downstream_keyers") : nullptr;
		const size_t count = keyers ? obs_data_array_count(keyers) : 0;
		for (size_t k = 0; k < count; k++) {
			OBSDataAutoRelease keyer = obs_data_array_item(keyers, k);
			const std::string name = obs_data_get_string(keyer, "name");
			for (int i = 0; i < kOverlayCount; i++) {
				if (name == std::to_string(i + 1)) {
					present[i] = true;
				}
			}
		}
	}

	void Refresh()
	{
		const bool allPresent = std::all_of(present.begin(), present.end(), [](bool value) { return value; });
		if (!allPresent || refreshesUntilPresence-- <= 0) {
			RefreshPresence();
			refreshesUntilPresence = 10;
		}

		/* What a keyer shows is asked with dsk_get_scene: the "scene" field of the list above is the list's
		 * cursor, which a keyer switched by request does not move. */
		for (int i = 0; i < kOverlayCount; i++) {
			scenes[i].clear();
			if (present[i]) {
				OBSDataAutoRelease answer = CallKeyer("dsk_get_scene", i + 1, nullptr);
				if (answer) {
					scenes[i] = obs_data_get_string(answer, "scene");
				}
			}
		}

		static int refreshTick = 0;
		const bool capture = (++refreshTick % 4) == 0;
		if (capture) ReadAssignments();
		for (int i = 0; i < kOverlayCount; i++) {
			QPushButton *button = buttons[i];
			const bool onAir = !scenes[i].empty();
			if (onAir) assigned[i] = scenes[i];
			const bool prepared = !onAir && !assigned[i].empty();
			button->setEnabled(present[i]);
			button->setChecked(onAir);
			/* The width is pinned in the style as well: the theme's default button minimum
			 * would otherwise centre the number outside the narrow key and clip it. */
			button->setStyleSheet(QString("font-size:15px; font-weight:700; padding:0px; "
						      "min-width:%1px; max-width:%2px; border-radius:3px; %3")
				.arg(kDskNumberWidth)
				.arg(kDskNumberWidth)
				.arg(onAir ? "background:#c01920; border:1px solid #ff6b70; color:#fff;"
					: prepared ? "background:#17652a; border:1px solid #43c45a; color:#fff;"
						   : "background:#303030; border:1px solid #555; color:#ddd;"));
			const QString number = QString::number(i + 1);
			const QString source = QString::fromStdString(assigned[i]);
			button->setToolTip(!present[i] ? QTStr("FreeMix.Overlay.Missing").arg(number)
				: onAir ? QString("DSK %1 · %2 · NO AR").arg(number, source)
				: prepared ? QString("DSK %1 · %2 · PREPARADO").arg(number, source)
					   : QString("DSK %1 · sem fonte").arg(number));
			if (onAir || prepared) {
				if (capture) UpdatePreview(i, assigned[i]);
			} else if (previews[i]) {
				previews[i]->setPixmap(QPixmap());
			}
			if (previews[i]) {
				previews[i]->setStyleSheet(QString("background:#11161b;border:1px solid %1;border-radius:3px;")
					.arg(onAir ? "#ff6b70" : prepared ? "#43c45a" : "#4a4a4a"));
			}
			if (names[i]) {
				const QString label = !present[i] ? QString("Sem DSK")
						      : (onAir || prepared) ? source
									    : QString("Sem fonte");
				const int available = qMax(24, names[i]->width() - 6);
				names[i]->setText(names[i]->fontMetrics().elidedText(label, Qt::ElideRight, available));
				names[i]->setToolTip(label);
				names[i]->setStyleSheet(QString("font-size:10px;padding-left:2px;color:%1;")
					.arg(onAir ? "#ff8a8f" : prepared ? "#7ee08d" : "#93a1af"));
			}
		}
	}

	void ReadAssignments()
	{
		OBSDataAutoRelease request = obs_data_create();
		obs_data_set_string(request, "realm", "OBS_WEBSOCKET_DATA_REALM_GLOBAL");
		obs_data_set_string(request, "slotName", "3mix_dsk_assignments");
		obs_websocket_request_response *response = obs_websocket_call_request("GetPersistentData", request);
		if (!response) return;
		OBSDataAutoRelease data = response->response_data ? obs_data_create_from_json(response->response_data) : nullptr;
		OBSDataAutoRelease value = data ? obs_data_get_obj(data, "slotValue") : nullptr;
		OBSDataAutoRelease assign = value ? obs_data_get_obj(value, "assign") : nullptr;
		if (assign) {
			for (int i = 0; i < kOverlayCount; i++) {
				const std::string name = std::to_string(i + 1);
				const char *source = obs_data_get_string(assign, name.c_str());
				assigned[i] = source ? source : "";
			}
		}
		obs_websocket_request_response_free(response);
	}

	void WriteAssignments()
	{
		OBSDataAutoRelease request = obs_data_create();
		OBSDataAutoRelease value = obs_data_create();
		OBSDataAutoRelease assign = obs_data_create();
		for (int i = 0; i < kOverlayCount; i++) {
			const std::string name = std::to_string(i + 1);
			obs_data_set_string(assign, name.c_str(), assigned[i].c_str());
		}
		obs_data_set_obj(value, "assign", assign);
		obs_data_set_string(request, "realm", "OBS_WEBSOCKET_DATA_REALM_GLOBAL");
		obs_data_set_string(request, "slotName", "3mix_dsk_assignments");
		obs_data_set_obj(request, "slotValue", value);
		obs_websocket_request_response *response = obs_websocket_call_request("SetPersistentData", request);
		if (response) obs_websocket_request_response_free(response);
	}

	void UpdatePreview(int index, const std::string &source)
	{
		if (!previews[index] || source.empty()) return;
		OBSDataAutoRelease request = obs_data_create();
		obs_data_set_string(request, "sourceName", source.c_str());
		obs_data_set_string(request, "imageFormat", "png");
		obs_data_set_int(request, "imageWidth", 192);
		obs_data_set_int(request, "imageHeight", 108);
		obs_data_set_int(request, "imageCompressionQuality", 55);
		obs_websocket_request_response *response = obs_websocket_call_request("GetSourceScreenshot", request);
		if (!response) return;
		OBSDataAutoRelease data = response->response_data ? obs_data_create_from_json(response->response_data) : nullptr;
		const char *encoded = data ? obs_data_get_string(data, "imageData") : "";
		if (encoded && *encoded) {
			QByteArray bytes = QByteArray::fromBase64(QByteArray(encoded));
			QPixmap pixmap;
			if (pixmap.loadFromData(bytes))
				previews[index]->setPixmap(pixmap.scaled(previews[index]->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation));
		}
		obs_websocket_request_response_free(response);
	}

	void TakeOff(int index, bool immediate = false)
	{
		const std::string scene = scenes[index];
		if (scene.empty()) {
			return;
		}

		QPointer<OverlayButtons> self(this);
		auto cut = [self, index, immediate]() {
			CallKeyer("dsk_select_scene", index + 1, "", immediate);
			if (self) {
				self->Refresh();
			}
		};

		if (!immediate && AskTitlesToLeave(scene)) {
			QTimer::singleShot(kTitleExitMs, qApp, cut);
		} else {
			cut();
		}
	}

	void Toggle(int index, bool immediate = false)
	{
		Refresh();

		OBSSourceAutoRelease preview = obs_frontend_get_current_preview_scene();
		const std::string previewName = preview ? obs_source_get_name(preview) : "";

		if (!present[index]) {
			Refresh();
			return;
		}

		// On air: leaving never clears the assigned source.
		if (!scenes[index].empty()) {
			TakeOff(index, immediate);
			return;
		}

		std::string target = assigned[index].empty() ? previewName : assigned[index];
		if (target.empty()) {
			Refresh();
			return;
		}
		assigned[index] = target;
		WriteAssignments();
		CallKeyer("dsk_add_scene", index + 1, target.c_str());
		QPointer<OverlayButtons> self(this);
		QTimer::singleShot(80, qApp, [self, index, target, immediate]() {
			CallKeyer("dsk_select_scene", index + 1, target.c_str(), immediate);
			if (self) self->Refresh();
		});
	}

	void ShowMenu(int index, const QPoint &globalPos)
	{
		Refresh();
		if (!present[index]) {
			return;
		}

		const QString number = QString::number(index + 1);
		QMenu menu(this);
		QAction *title = menu.addAction(scenes[index].empty() ? QTStr("FreeMix.Overlay.Empty").arg(number)
								      : QTStr("FreeMix.Overlay.OnAir").arg(
										number, QString::fromStdString(scenes[index])));
		title->setEnabled(false);
		menu.addSeparator();
		QAction *off = menu.addAction(QTStr("FreeMix.Overlay.Off").arg(number));
		off->setEnabled(!scenes[index].empty());
		connect(off, &QAction::triggered, this, [this, index]() { TakeOff(index); });
		menu.exec(globalPos);
	}
};

/* -------------------------------------------------------------------------- */

constexpr float kMeterFloorDb = -60.0f;
constexpr int kMeterChannels = 2;

class MasterMeter : public QWidget {
public:
	explicit MasterMeter(QWidget *parent) : QWidget(parent)
	{
		setObjectName("freemixMasterMeter");
		setFixedWidth(16);
		setMinimumHeight(40);
		/* Takes the height of the row it is in without asking for more: a widget that wants to expand here
		 * makes the main window give the Preview/Output area the room of the docks below when it is restored. */
		setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Preferred);
		setToolTip(QTStr("FreeMix.Meter.ToolTip"));

		for (auto &value : peak) {
			value.store(0.0f);
		}

		obs_add_raw_audio_callback(0, nullptr, AudioCallback, this);

		QTimer *timer = new QTimer(this);
		connect(timer, &QTimer::timeout, this, [this]() { Tick(); });
		timer->start(33);

		onScreen = this;
	}

	~MasterMeter() override
	{
		obs_remove_raw_audio_callback(0, AudioCallback, this);
		if (onScreen == this) {
			onScreen = nullptr;
		}
	}

	/* The meter on screen, if any. Interface thread only. */
	static inline MasterMeter *onScreen = nullptr;

	float Shown(int channel) const { return shown[channel]; }

protected:
	void paintEvent(QPaintEvent *) override
	{
		QPainter painter(this);
		painter.fillRect(rect(), QColor(0x0f, 0x13, 0x18));

		const int gap = 2;
		const int barWidth = (width() - gap * (kMeterChannels + 1)) / kMeterChannels;
		const int top = gap;
		const int full = height() - gap * 2;

		/* Colour changes at the levels the engine's own meters use: yellow from -20 dB, red from -9 dB. */
		const int yellowFrom = full - int(Fraction(-20.0f) * float(full));
		const int redFrom = full - int(Fraction(-9.0f) * float(full));

		for (int channel = 0; channel < kMeterChannels; channel++) {
			const int x = gap + channel * (barWidth + gap);
			painter.fillRect(x, top, barWidth, full, QColor(0x1c, 0x22, 0x2a));

			const int level = int(Fraction(shown[channel]) * float(full));
			if (level > 0) {
				const int start = full - level;
				DrawSpan(painter, x, barWidth, top, start, redFrom, QColor(0xd9, 0x24, 0x18));
				DrawSpan(painter, x, barWidth, top, std::max(start, redFrom), yellowFrom,
					 QColor(0xe6, 0xc2, 0x29));
				DrawSpan(painter, x, barWidth, top, std::max(start, yellowFrom), full,
					 QColor(0x12, 0xa3, 0x1a));
			}

			const int holdY = top + full - int(Fraction(held[channel]) * float(full));
			if (held[channel] > kMeterFloorDb) {
				painter.fillRect(x, std::min(holdY, top + full - 1), barWidth, 1, QColor(0xff, 0xff, 0xff));
			}
		}
	}

private:
	/* Highest sample since the last tick, written by the audio thread. */
	std::array<std::atomic<float>, kMeterChannels> peak;
	std::array<float, kMeterChannels> shown{kMeterFloorDb, kMeterFloorDb};
	std::array<float, kMeterChannels> held{kMeterFloorDb, kMeterFloorDb};
	std::array<int, kMeterChannels> holdTicks{};

	static float Fraction(float db) { return std::clamp((db - kMeterFloorDb) / -kMeterFloorDb, 0.0f, 1.0f); }

	static void DrawSpan(QPainter &painter, int x, int width, int top, int from, int to, const QColor &color)
	{
		if (to > from) {
			painter.fillRect(x, top + from, width, to - from, color);
		}
	}

	static void AudioCallback(void *param, size_t, struct audio_data *data)
	{
		MasterMeter *meter = static_cast<MasterMeter *>(param);

		for (int channel = 0; channel < kMeterChannels; channel++) {
			/* A mono mix has one plane: it is shown on both bars. */
			const float *samples = reinterpret_cast<const float *>(data->data[channel] ? data->data[channel]
												  : data->data[0]);
			if (!samples) {
				continue;
			}

			float highest = 0.0f;
			for (uint32_t i = 0; i < data->frames; i++) {
				highest = std::max(highest, std::fabs(samples[i]));
			}

			float current = meter->peak[channel].load(std::memory_order_relaxed);
			while (highest > current &&
			       !meter->peak[channel].compare_exchange_weak(current, highest, std::memory_order_relaxed)) {
			}
		}
	}

	void Tick()
	{
		bool changed = false;

		for (int channel = 0; channel < kMeterChannels; channel++) {
			const float linear = peak[channel].exchange(0.0f, std::memory_order_relaxed);
			const float db = linear > 0.0f ? std::max(20.0f * std::log10(linear), kMeterFloorDb) : kMeterFloorDb;

			/* Rises at once, falls 40 dB per second. */
			const float next = std::max(db, shown[channel] - 40.0f * 0.033f);
			if (next != shown[channel]) {
				shown[channel] = std::max(next, kMeterFloorDb);
				changed = true;
			}

			/* The peak mark stays for one second. */
			if (db > held[channel]) {
				held[channel] = db;
				holdTicks[channel] = 30;
				changed = true;
			} else if (holdTicks[channel] > 0 && --holdTicks[channel] == 0) {
				held[channel] = shown[channel];
				changed = true;
			}
		}

		if (changed) {
			update();
		}
	}
};

struct ClockSlot {
	std::string type;
	std::string start;
	std::string end;
	int offset = 0;
	bool ampm = false;
};

OBSDataAutoRelease RequestJson(const char *type, obs_data_t *request)
{
	obs_websocket_request_response *response = obs_websocket_call_request(type, request);
	if (!response || !response->response_data)
		return nullptr;
	return obs_data_create_from_json(response->response_data);
}

QTime ParseClockTime(const std::string &value)
{
	const QStringList parts = QString::fromStdString(value).split(':');
	if (parts.size() < 2)
		return {};
	return QTime(parts[0].toInt(), parts[1].toInt(), parts.size() > 2 ? parts[2].toInt() : 0);
}

QString FormatHms(qint64 seconds)
{
	if (seconds < 0)
		seconds = 0;
	const qint64 h = seconds / 3600, m = (seconds / 60) % 60, s = seconds % 60;
	return QString("%1:%2:%3")
		.arg(h, 2, 10, QChar('0'))
		.arg(m, 2, 10, QChar('0'))
		.arg(s, 2, 10, QChar('0'));
}

std::vector<ClockSlot> ReadClockSlots()
{
	std::vector<ClockSlot> clockSlots;
	OBSDataAutoRelease request = obs_data_create();
	obs_data_set_string(request, "realm", "OBS_WEBSOCKET_DATA_REALM_GLOBAL");
	obs_data_set_string(request, "slotName", "freemix_clocks");
	OBSDataAutoRelease response = RequestJson("GetPersistentData", request);
	OBSDataArrayAutoRelease array = response ? obs_data_get_array(response, "slotValue") : nullptr;
	const size_t count = array ? obs_data_array_count(array) : 0;
	for (size_t i = 0; i < count; i++) {
		OBSDataAutoRelease item = obs_data_array_item(array, i);
		ClockSlot slot;
		slot.type = obs_data_get_string(item, "type");
		slot.start = obs_data_get_string(item, "start");
		slot.end = obs_data_get_string(item, "end");
		slot.offset = (int)obs_data_get_int(item, "offset");
		slot.ampm = obs_data_get_bool(item, "ampm");
		clockSlots.push_back(slot);
	}
	if (clockSlots.empty())
		clockSlots = {{"rec"}, {"stream"}, {"clock"}};
	return clockSlots;
}

QString OutputTimecode(const char *requestType, bool &active)
{
	active = false;
	OBSDataAutoRelease request = obs_data_create();
	OBSDataAutoRelease response = RequestJson(requestType, request);
	if (!response)
		return "00:00:00";
	active = obs_data_get_bool(response, "outputActive");
	const QString timecode = QString::fromUtf8(obs_data_get_string(response, "outputTimecode"));
	return timecode.left(8);
}

QString MediaRemaining()
{
	static QString mediaName;
	static qint64 mediaAt = 0;
	const qint64 now = QDateTime::currentMSecsSinceEpoch();
	if (mediaName.isEmpty() || now - mediaAt > 2000) {
		mediaAt = now;
		OBSDataAutoRelease request = obs_data_create();
		OBSDataAutoRelease current = RequestJson("GetCurrentProgramScene", request);
		const QString scene = current ? QString::fromUtf8(obs_data_get_string(current, "currentProgramSceneName")) : QString();
		mediaName.clear();
		if (!scene.isEmpty()) {
			OBSDataAutoRelease listRequest = obs_data_create();
			obs_data_set_string(listRequest, "sceneName", scene.toUtf8().constData());
			OBSDataAutoRelease list = RequestJson("GetSceneItemList", listRequest);
			OBSDataArrayAutoRelease items = list ? obs_data_get_array(list, "sceneItems") : nullptr;
			const size_t count = items ? obs_data_array_count(items) : 0;
			for (size_t i = 0; i < count; i++) {
				OBSDataAutoRelease item = obs_data_array_item(items, i);
				const QString kind = QString::fromUtf8(obs_data_get_string(item, "inputKind"));
				if (kind == "ffmpeg_source" || kind == "vlc_source" || kind.contains("playlist")) {
					mediaName = QString::fromUtf8(obs_data_get_string(item, "sourceName"));
					break;
				}
			}
		}
	}
	if (mediaName.isEmpty())
		return "--:--:--";
	OBSDataAutoRelease request = obs_data_create();
	obs_data_set_string(request, "inputName", mediaName.toUtf8().constData());
	OBSDataAutoRelease status = RequestJson("GetMediaInputStatus", request);
	const double duration = status ? obs_data_get_double(status, "mediaDuration") : 0;
	const double cursor = status ? obs_data_get_double(status, "mediaCursor") : 0;
	if (duration <= 0)
		return "--:--:--";
	return FormatHms((qint64)((duration - cursor) / 1000.0));
}

QString CenterClockHtml()
{
	static std::vector<ClockSlot> clockSlots;
	static qint64 clockSlotsAt = 0;
	const qint64 now = QDateTime::currentMSecsSinceEpoch();
	if (clockSlots.empty() || now - clockSlotsAt > 2000) {
		clockSlots = ReadClockSlots();
		clockSlotsAt = now;
	}

	bool hasRec = false, hasStream = false, hasRemaining = false;
	for (const ClockSlot &slot : clockSlots) {
		hasRec = hasRec || slot.type == "rec";
		hasStream = hasStream || slot.type == "stream";
		hasRemaining = hasRemaining || slot.type == "remaining";
	}
	bool recActive = false, streamActive = false;
	QString recTimecode, streamTimecode;
	if (hasRec)
		recTimecode = OutputTimecode("GetRecordStatus", recActive);
	if (hasStream)
		streamTimecode = OutputTimecode("GetStreamStatus", streamActive);

	/* Six lines: each clock is a small label with its timecode below, stacked as blocks. Three groups
	 * use the whole square under the T-Bar instead of sharing one cramped line each. */
	const auto block = [](const QString &name, const QString &value, const QString &nameColor,
			      const QString &valueColor, int valuePx, bool first) {
		return QString("<div style='text-align:center;%1'>"
			       "<div style='font-size:9px;letter-spacing:.12em;color:%2;line-height:1.15'>%3</div>"
			       "<div style='font-size:%4px;font-weight:700;font-family:Consolas;color:%5;line-height:1.0'>%6</div>"
			       "</div>")
			.arg(first ? QString() : QString("margin-top:4px;"))
			.arg(nameColor, name)
			.arg(valuePx)
			.arg(valueColor, value);
	};

	QString html;
	int lines = 0;
	for (const ClockSlot &slot : clockSlots) {
		const bool first = lines == 0;
		QString line;
		if (slot.type == "rec") {
			line = block("REC", recTimecode, recActive ? "#ff5a4f" : "#6e7b88",
				     recActive ? "#ff8a8f" : "#e8eef4", 21, first);
		} else if (slot.type == "stream") {
			line = block("NO AR", streamTimecode, streamActive ? "#ff5a4f" : "#6e7b88",
				     streamActive ? "#ff8a8f" : "#e8eef4", 21, first);
		} else if (slot.type == "remaining") {
			line = block("RESTA", MediaRemaining(), "#93a1af", "#e8eef4", 20, first);
		} else if (slot.type == "event") {
			const QTime start = ParseClockTime(slot.start), end = ParseClockTime(slot.end);
			const int nowSec = QTime::currentTime().msecsSinceStartOfDay() / 1000;
			const int startSec = start.msecsSinceStartOfDay() / 1000;
			const int endSec = end.msecsSinceStartOfDay() / 1000;
			QString color = "#e3b25b", text;
			qint64 diff = 0;
			if (!start.isValid()) {
				text = "--:--:--";
			} else if (nowSec < startSec) {
				diff = startSec - nowSec;
				text = "-" + FormatHms(diff);
			} else if (end.isValid() && nowSec < endSec) {
				color = "#39c46f";
				diff = endSec - nowSec;
				text = FormatHms(diff);
			} else if (end.isValid()) {
				color = "#ff5a4f";
				diff = nowSec - endSec;
				text = "+" + FormatHms(diff);
			} else {
				color = "#39c46f";
				diff = nowSec - startSec;
				text = FormatHms(diff);
			}
			line = block("EVENTO", text, color, color, 20, first);
		} else if (slot.type == "clock") {
			const QTime clockTime = QTime::currentTime().addSecs(slot.offset * 3600);
			line = block("RELÓGIO", clockTime.toString(slot.ampm ? "hh:mm:ss AP" : "HH:mm:ss"),
				     "#93a1af", "#e8eef4", 21, first);
		}
		if (!line.isEmpty()) {
			lines++;
			html += line;
		}
	}
	return lines ? html : QString("<span style='color:#6e7b88'>—</span>");
}

} // namespace

QString FreeMixCenterClockHtml()
{
	return CenterClockHtml();
}

QWidget *FreeMixCreateOverlayButtons(QWidget *parent)
{
	return new OverlayButtons(parent);
}

/* Aligns the last DSK row with the bottom of the Talkback button. */
void FreeMixDskBindBottomLine(QWidget *dsk, QWidget *talk)
{
	Q_UNUSED(dsk);
	OverlayButtons::BindBottomLine(talk);
}

QWidget *FreeMixCreateMasterMeter(QWidget *parent)
{
	return new MasterMeter(parent);
}

QWidget *FreeMixCreateClocks(QWidget *parent)
{
#ifdef BROWSER_AVAILABLE
	if (cef) {
		QUrl url = QUrl::fromLocalFile(QDir(QCoreApplication::applicationDirPath()).absoluteFilePath("../../painel/topbar.html"));
		url.setQuery("mode=clocks");
		QCefWidget *clocks = cef->create_widget(parent, url.toString().toUtf8().constData(), nullptr);
		if (clocks) { clocks->setObjectName("freemixProductionClocks"); clocks->setFixedHeight(122); return clocks; }
	}
#endif
	auto *clock = new QLabel(parent);
	clock->setObjectName("freemixProductionClocks");
	clock->setAlignment(Qt::AlignCenter);
	clock->setFixedHeight(40);
	auto *timer = new QTimer(clock);
	QObject::connect(timer, &QTimer::timeout, clock, [clock]() { clock->setText(QDateTime::currentDateTime().toString("HH:mm:ss")); });
	timer->start(1000);
	return clock;
}

void FreeMixOpenClocks()
{
	OBSDataAutoRelease data = obs_data_create();
	OBSDataAutoRelease eventData = obs_data_create();
	OBSDataAutoRelease freemix = obs_data_create();
	obs_data_set_string(freemix, "open", "clocks");
	obs_data_set_obj(eventData, "freemix", freemix);
	obs_data_set_obj(data, "eventData", eventData);
	obs_websocket_call_request("BroadcastCustomEvent", data);
}

bool FreeMixMasterLevel(float &leftDb, float &rightDb)
{
	if (!MasterMeter::onScreen) {
		return false;
	}
	leftDb = MasterMeter::onScreen->Shown(0);
	rightDb = MasterMeter::onScreen->Shown(1);
	return true;
}
