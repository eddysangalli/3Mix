/******************************************************************************
    FreeMix: waveform monitor and vectorscope of the Preview window.

    Chosen from the colour bars icon in the title bar of the Preview, next to the Safe Area icon: Waveform RGB,
    Waveform Y, Parade RGB or Vectorscope, drawn in the Preview window in place of the picture or, with
    "+ Preview", in its lower right corner with the picture kept.

    The measuring itself is done by the Color Monitor sources (plugins/obs-color-monitor): one private source of
    the chosen kind is kept here, pointed at what the Preview shows, and drawn by OBSBasic::RenderMain.

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

#include <qt-wrappers.hpp>

#include <QActionGroup>
#include <QHBoxLayout>
#include <QMenu>
#include <QPainter>
#include <QPixmap>
#include <QToolButton>

#include <algorithm>

namespace {

/* Values of the "display" and "components" settings of the waveform source. */
constexpr int kDisplayOverlaid = 0;
constexpr int kDisplayParade = 2;
constexpr int kComponentsRGB = 0x07;
constexpr int kComponentsLuma = 0x20;

/* Names the Color Monitor sources give to "what is on Program" and "what is on Preview". */
const char *const kTargetProgram = "";
const char *const kTargetPreview = "\x10";

struct ScopeChoice {
	const char *label;
	const char *sourceId; /* nullptr: no scope */
	int display;
	int components;
};

/* Same names and order as the reference menu. */
const ScopeChoice scopeChoices[] = {
	{"None", nullptr, 0, 0},
	{"Waveform RGB", "waveform_source", kDisplayOverlaid, kComponentsRGB},
	{"Waveform Y", "waveform_source", kDisplayOverlaid, kComponentsLuma},
	{"Parade RGB", "waveform_source", kDisplayParade, kComponentsRGB},
	{"Vectorscope", "vectorscope_source", 0, 0},
};

const int scopeChoiceCount = int(sizeof(scopeChoices) / sizeof(scopeChoices[0]));

bool ScopeAvailable(const ScopeChoice &choice)
{
	return !choice.sourceId || obs_get_latest_input_type_id(choice.sourceId) != nullptr;
}

QIcon ColourBarsIcon()
{
	static const QColor bars[] = {QColor(235, 235, 235), QColor(235, 235, 16), QColor(16, 235, 235),
				      QColor(16, 235, 16),   QColor(235, 16, 235), QColor(235, 16, 16),
				      QColor(16, 16, 235)};
	const int count = int(sizeof(bars) / sizeof(bars[0]));
	const int barWidth = 4;

	QPixmap pixmap(count * barWidth, 20);
	QPainter painter(&pixmap);
	for (int i = 0; i < count; i++) {
		painter.fillRect(i * barWidth, 0, barWidth, pixmap.height(), bars[i]);
	}
	return QIcon(pixmap);
}

} // namespace

void OBSBasic::SetScopeMode(int mode, bool withPreview)
{
	if (mode < 0 || mode >= scopeChoiceCount) {
		mode = 0;
	}

	obs_source_t *created = nullptr;
	const ScopeChoice &choice = scopeChoices[mode];

	if (choice.sourceId) {
		const char *id = obs_get_latest_input_type_id(choice.sourceId);
		if (id) {
			OBSDataAutoRelease settings = obs_data_create();
			obs_data_set_string(settings, "target_name",
					    IsPreviewProgramMode() ? kTargetPreview : kTargetProgram);
			obs_data_set_int(settings, "target_scale", 2);
			if (strcmp(choice.sourceId, "waveform_source") == 0) {
				obs_data_set_int(settings, "display", choice.display);
				obs_data_set_int(settings, "components", choice.components);
			}
			created = obs_source_create_private(id, "FreeMix Scope", settings);
		}
		if (!created) {
			mode = 0;
		}
	}

	/* The preview is drawn with the graphics context held, so the source is only swapped while holding it too. */
	obs_enter_graphics();
	obs_source_t *previous = scopeSource;
	scopeSource = created;
	scopeMode = mode;
	scopeWithPreview = withPreview;
	scopeSquare = created && strcmp(choice.sourceId, "vectorscope_source") == 0;
	obs_leave_graphics();

	obs_source_release(previous);

	config_set_int(App()->GetUserConfig(), "BasicWindow", "FreeMixScope", mode);
	config_set_bool(App()->GetUserConfig(), "BasicWindow", "FreeMixScopePreview", withPreview);
}

/* Without the Preview/Output pair there is no Preview scene: the scope then measures what is on Program. */
void OBSBasic::UpdateScopeTarget()
{
	if (!scopeSource) {
		return;
	}

	OBSDataAutoRelease settings = obs_data_create();
	obs_data_set_string(settings, "target_name", IsPreviewProgramMode() ? kTargetPreview : kTargetProgram);
	obs_source_update(scopeSource, settings);
}

/* Called by RenderMain with the production frame as the coordinate system (0..baseCX, 0..baseCY). */
void OBSBasic::RenderScope(uint32_t baseCX, uint32_t baseCY)
{
	if (!scopeSource) {
		return;
	}

	float areaX = 0.0f;
	float areaY = 0.0f;
	float areaCX = float(baseCX);
	float areaCY = float(baseCY);

	if (scopeWithPreview) {
		const float margin = float(baseCX) * 0.01f;
		areaCX = float(baseCX) * 0.45f;
		areaCY = float(baseCY) * 0.45f;
		areaX = float(baseCX) - areaCX - margin;
		areaY = float(baseCY) - areaCY - margin;
	}

	gs_blend_state_push();
	gs_reset_blend_state();

	gs_effect_t *solid = obs_get_base_effect(OBS_EFFECT_SOLID);
	gs_eparam_t *color = gs_effect_get_param_by_name(solid, "color");
	vec4 black;
	vec4_set(&black, 0.0f, 0.0f, 0.0f, 1.0f);
	gs_effect_set_vec4(color, &black);

	gs_matrix_push();
	gs_matrix_translate3f(areaX, areaY, 0.0f);
	while (gs_effect_loop(solid, "Solid")) {
		gs_draw_sprite(nullptr, 0, uint32_t(areaCX), uint32_t(areaCY));
	}
	gs_matrix_pop();

	/* A waveform fills the area; the vectorscope keeps its square shape. The source has no size until its first
	 * frame has been measured, and it is only measured when asked to draw. */
	const float sourceCX = float(obs_source_get_width(scopeSource));
	const float sourceCY = float(obs_source_get_height(scopeSource));
	float scaleX = 1.0f;
	float scaleY = 1.0f;

	if (sourceCX > 0.0f && sourceCY > 0.0f) {
		scaleX = areaCX / sourceCX;
		scaleY = areaCY / sourceCY;
		if (scopeSquare) {
			scaleX = scaleY = std::min(scaleX, scaleY);
			areaX += (areaCX - sourceCX * scaleX) / 2.0f;
			areaY += (areaCY - sourceCY * scaleY) / 2.0f;
		}
	}

	gs_matrix_push();
	gs_matrix_translate3f(areaX, areaY, 0.0f);
	gs_matrix_scale3f(scaleX, scaleY, 1.0f);
	obs_source_video_render(scopeSource);
	gs_matrix_pop();

	gs_blend_state_pop();

	scopeFramesDrawn.fetch_add(1, std::memory_order_relaxed);
}

/* State of the scope, for the control server (vendor "freemix", requests get_scope and set_scope). */
void OBSBasic::DescribeScope(obs_data_t *out)
{
	obs_data_set_int(out, "mode", scopeMode);
	obs_data_set_string(out, "name", scopeChoices[scopeMode].label);
	obs_data_set_bool(out, "with_preview", scopeWithPreview);
	obs_data_set_int(out, "frames_drawn", scopeFramesDrawn.load(std::memory_order_relaxed));
	obs_data_set_int(out, "width", scopeSource ? obs_source_get_width(scopeSource) : 0);
	obs_data_set_int(out, "height", scopeSource ? obs_source_get_height(scopeSource) : 0);

	OBSDataArrayAutoRelease modes = obs_data_array_create();
	for (int i = 0; i < scopeChoiceCount; i++) {
		OBSDataAutoRelease item = obs_data_create();
		obs_data_set_int(item, "mode", i);
		obs_data_set_string(item, "name", scopeChoices[i].label);
		obs_data_set_bool(item, "available", ScopeAvailable(scopeChoices[i]));
		obs_data_array_push_back(modes, item);
	}
	obs_data_set_array(out, "modes", modes);
}

void OBSBasic::InitScopeMenu()
{
	QToolButton *button = new QToolButton(ui->previewLabel);
	button->setObjectName("freemixScopeButton");
	button->setIcon(ColourBarsIcon());
	button->setIconSize(QSize(18, 11));
	button->setToolTip("Waveform / Vectorscope");
	button->setPopupMode(QToolButton::InstantPopup);
	button->setCursor(Qt::ArrowCursor);
	button->setAutoRaise(true);

	QMenu *menu = new QMenu(button);
	menu->setToolTipsVisible(true);

	QAction *title = menu->addAction("Waveform / Vectorscope");
	title->setEnabled(false);
	menu->addSeparator();

	const int saved = int(config_get_int(App()->GetUserConfig(), "BasicWindow", "FreeMixScope"));
	const int current = (saved >= 0 && saved < scopeChoiceCount && ScopeAvailable(scopeChoices[saved])) ? saved : 0;
	const bool withPreview = config_get_bool(App()->GetUserConfig(), "BasicWindow", "FreeMixScopePreview");

	QActionGroup *group = new QActionGroup(menu);
	for (int i = 0; i < scopeChoiceCount; i++) {
		QAction *action = menu->addAction(scopeChoices[i].label);
		action->setCheckable(true);
		if (!ScopeAvailable(scopeChoices[i])) {
			action->setEnabled(false);
			action->setToolTip(QTStr("FreeMix.Scope.Missing"));
		}
		group->addAction(action);
		connect(action, &QAction::triggered, this, [this, i]() { SetScopeMode(i, scopeWithPreview); });
	}

	menu->addSeparator();
	QAction *keepPicture = menu->addAction("+ Preview");
	keepPicture->setCheckable(true);
	keepPicture->setToolTip(QTStr("FreeMix.Scope.KeepPicture"));
	connect(keepPicture, &QAction::triggered, this, [this](bool checked) { SetScopeMode(scopeMode, checked); });

	/* The scope can also be changed through the control server: the marks are set when the menu opens. */
	connect(menu, &QMenu::aboutToShow, this, [this, group, keepPicture]() {
		const QList<QAction *> actions = group->actions();
		if (scopeMode < actions.size()) {
			actions[scopeMode]->setChecked(true);
		}
		keepPicture->setChecked(scopeWithPreview);
	});

	button->setMenu(menu);

	/* The Safe Area menu has already laid the title bar out: a stretch, then its icon. This one goes before it. */
	QHBoxLayout *layout = qobject_cast<QHBoxLayout *>(ui->previewLabel->layout());
	if (layout) {
		layout->insertWidget(1, button);
	}

	connect(this, &OBSBasic::PreviewProgramModeChanged, this, [this]() { UpdateScopeTarget(); });

	SetScopeMode(current, withPreview);
}
