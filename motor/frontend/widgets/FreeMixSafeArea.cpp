/******************************************************************************
    FreeMix: safe area and grid guides of the Preview window.

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

#include <QActionGroup>
#include <QHBoxLayout>
#include <QMenu>
#include <QToolButton>

namespace {

struct SafeAreaChoice {
	const char *label;
	/* A choice whose geometry has not been confirmed against the reference yet is listed but cannot be picked. */
	bool available;
};

/* Same names and order as the reference menu. All 12 options enabled. */
const SafeAreaChoice safeAreaChoices[] = {
	{"None", true},        {"SMPTE/EBU", true}, {"SMPTE/EBU with 4:3", true}, {"90% / 80%", true},
	{"90% / 80% with 4:3", true}, {"GRID 3", true},    {"GRID 4", true},             {"GRID 8 16:9", true},
	{"GRID 16", true},     {"GRID 32", true},   {"Square 1:1", true},         {"Vertical 9:16", true},
};

const int safeAreaChoiceCount = int(sizeof(safeAreaChoices) / sizeof(safeAreaChoices[0]));

/* Guides are line strips in 0..1 coordinates of the production frame; the caller holds the graphics context. */
void AddBox(std::vector<gs_vertbuffer_t *> &guides, float marginX, float marginY)
{
	gs_render_start(true);
	gs_vertex2f(marginX, marginY);
	gs_vertex2f(marginX, 1.0f - marginY);
	gs_vertex2f(1.0f - marginX, 1.0f - marginY);
	gs_vertex2f(1.0f - marginX, marginY);
	gs_vertex2f(marginX, marginY);
	guides.push_back(gs_render_save());
}

void AddLine(std::vector<gs_vertbuffer_t *> &guides, float x1, float y1, float x2, float y2)
{
	gs_render_start(true);
	gs_vertex2f(x1, y1);
	gs_vertex2f(x2, y2);
	guides.push_back(gs_render_save());
}

/* Centre mark with arms of the same length on screen: `size` is a fraction of the frame width. */
void AddCross(std::vector<gs_vertbuffer_t *> &guides, float cx, float cy, float size, float aspect)
{
	AddLine(guides, cx - size, cy, cx + size, cy);
	AddLine(guides, cx, cy - size * aspect, cx, cy + size * aspect);
}

void AddGrid(std::vector<gs_vertbuffer_t *> &guides, int divisions)
{
	for (int i = 1; i < divisions; i++) {
		const float pos = float(i) / float(divisions);
		AddLine(guides, pos, 0.0f, pos, 1.0f);
		AddLine(guides, 0.0f, pos, 1.0f, pos);
	}
}

/* Side margin of an area of the given aspect ratio, centred in the frame, with its own inner margin. */
float CentredMargin(float areaAspect, float frameAspect, float innerMargin)
{
	const float width = areaAspect / frameAspect;
	if (width >= 1.0f) {
		return innerMargin;
	}
	return (1.0f - width) / 2.0f + innerMargin * width;
}

} // namespace

void OBSBasic::SetSafeAreaMode(int mode)
{
	if (mode < 0 || mode >= safeAreaChoiceCount || !safeAreaChoices[mode].available) {
		mode = 0;
	}

	float aspect = 16.0f / 9.0f;
	obs_video_info ovi;
	if (obs_get_video_info(&ovi) && ovi.base_height) {
		aspect = float(ovi.base_width) / float(ovi.base_height);
	}

	/* The preview is drawn with the graphics context held, so the list is only touched while holding it too. */
	obs_enter_graphics();

	for (gs_vertbuffer_t *guide : safeAreaGuides) {
		gs_vertexbuffer_destroy(guide);
	}
	safeAreaGuides.clear();

	switch (mode) {
	case 1: /* action safe 93 %, graphics safe 90 % */
	case 2:
		AddBox(safeAreaGuides, 0.035f, 0.035f);
		AddBox(safeAreaGuides, 0.05f, 0.05f);
		AddCross(safeAreaGuides, 0.5f, 0.5f, 0.02f, aspect);
		if (mode == 2) {
			AddBox(safeAreaGuides, CentredMargin(4.0f / 3.0f, aspect, 0.05f), 0.05f);
		}
		break;
	case 3: /* action safe 90 %, title safe 80 % */
	case 4:
		AddBox(safeAreaGuides, 0.05f, 0.05f);
		AddBox(safeAreaGuides, 0.10f, 0.10f);
		AddCross(safeAreaGuides, 0.5f, 0.5f, 0.02f, aspect);
		if (mode == 4) {
			AddBox(safeAreaGuides, CentredMargin(4.0f / 3.0f, aspect, 0.10f), 0.10f);
		}
		break;
	case 5:
		AddGrid(safeAreaGuides, 3);
		break;
	case 6:
		AddGrid(safeAreaGuides, 4);
		break;
	case 7:
		AddGrid(safeAreaGuides, 8);
		break;
	case 8:
		AddGrid(safeAreaGuides, 16);
		break;
	case 9:
		AddGrid(safeAreaGuides, 32);
		break;
	case 10:
		AddBox(safeAreaGuides, CentredMargin(1.0f, aspect, 0.0f), 0.0f);
		break;
	case 11:
		AddBox(safeAreaGuides, CentredMargin(9.0f / 16.0f, aspect, 0.0f), 0.0f);
		break;
	default:
		break;
	}

	safeAreaMode = mode;

	obs_leave_graphics();

	config_set_int(App()->GetUserConfig(), "BasicWindow", "FreeMixSafeArea", mode);
}

void OBSBasic::InitSafeAreaMenu()
{
	QToolButton *button = new QToolButton(ui->previewLabel);
	button->setObjectName("freemixSafeAreaButton");
	button->setText(QString::fromUtf8("\xE2\x96\xA3"));
	button->setToolTip("Safe Area");
	button->setPopupMode(QToolButton::InstantPopup);
	button->setCursor(Qt::ArrowCursor);
	button->setAutoRaise(true);

	QMenu *menu = new QMenu(button);
	menu->setToolTipsVisible(true);

	QAction *title = menu->addAction("Safe Area");
	title->setEnabled(false);
	menu->addSeparator();

	const int saved = int(config_get_int(App()->GetUserConfig(), "BasicWindow", "FreeMixSafeArea"));
	const int current = (saved >= 0 && saved < safeAreaChoiceCount && safeAreaChoices[saved].available) ? saved : 0;

	QActionGroup *group = new QActionGroup(menu);
	for (int i = 0; i < safeAreaChoiceCount; i++) {
		QAction *action = menu->addAction(safeAreaChoices[i].label);
		action->setCheckable(true);
		action->setChecked(i == current);
		action->setEnabled(safeAreaChoices[i].available);
		if (!safeAreaChoices[i].available) {
			action->setToolTip("Not available yet: its layout still has to be confirmed against the reference");
		}
		group->addAction(action);
		connect(action, &QAction::triggered, this, [this, i]() { SetSafeAreaMode(i); });
	}

	button->setMenu(menu);

	QHBoxLayout *layout = new QHBoxLayout(ui->previewLabel);
	layout->setContentsMargins(0, 0, 6, 0);
	layout->addStretch();
	layout->addWidget(button);

	SetSafeAreaMode(current);
}
