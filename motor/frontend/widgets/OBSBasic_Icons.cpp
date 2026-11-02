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

#include <QColor>
#include <QPainter>
#include <QPen>
#include <QPixmap>

QIcon OBSBasic::FreeMixTrayIcon(bool active, bool paused) const
{
 const QIcon brand(":/res/images/freemix.png");
 if (!active || brand.isNull())
  return brand;

 QIcon result;
 // Supply physical sizes for the tray's DPI; the badge must remain legible at 16px.
 for (const int side : {16, 20, 22, 24, 32, 48, 64, 128}) {
  QPixmap image(side, side);
  image.fill(Qt::transparent);
  QPainter painter(&image);
  painter.setRenderHint(QPainter::Antialiasing);
  painter.setRenderHint(QPainter::SmoothPixmapTransform);
  painter.drawPixmap(QRect(0, 0, side, side), brand.pixmap(side, side));
  const qreal edge = side * 0.48;
  const QRectF badge(0.75, side - edge - 0.75, edge, edge);
  painter.setPen(QPen(Qt::white, side < 32 ? 1.0 : side / 32.0));
  painter.setBrush(paused ? QColor(255, 193, 7) : QColor(229, 57, 53));
  if (paused) {
   painter.drawRoundedRect(badge, edge * 0.15, edge * 0.15);
   painter.setPen(Qt::NoPen);
   painter.setBrush(QColor(20, 20, 20));
   const qreal bar = edge * 0.18, top = badge.top() + edge * 0.22, height = edge * 0.56;
   painter.drawRect(QRectF(badge.left() + edge * 0.23, top, bar, height));
   painter.drawRect(QRectF(badge.left() + edge * 0.59, top, bar, height));
  } else {
   painter.drawEllipse(badge);
  }
  painter.end();
  result.addPixmap(image);
 }
 return result;
}

QIcon OBSBasic::GetSourceIcon(const char *id) const
{
	obs_icon_type type = obs_source_get_icon_type(id);

	switch (type) {
	case OBS_ICON_TYPE_IMAGE:
		return GetImageIcon();
	case OBS_ICON_TYPE_COLOR:
		return GetColorIcon();
	case OBS_ICON_TYPE_SLIDESHOW:
		return GetSlideshowIcon();
	case OBS_ICON_TYPE_AUDIO_INPUT:
		return GetAudioInputIcon();
	case OBS_ICON_TYPE_AUDIO_OUTPUT:
		return GetAudioOutputIcon();
	case OBS_ICON_TYPE_DESKTOP_CAPTURE:
		return GetDesktopCapIcon();
	case OBS_ICON_TYPE_WINDOW_CAPTURE:
		return GetWindowCapIcon();
	case OBS_ICON_TYPE_GAME_CAPTURE:
		return GetGameCapIcon();
	case OBS_ICON_TYPE_CAMERA:
		return GetCameraIcon();
	case OBS_ICON_TYPE_TEXT:
		return GetTextIcon();
	case OBS_ICON_TYPE_MEDIA:
		return GetMediaIcon();
	case OBS_ICON_TYPE_BROWSER:
		return GetBrowserIcon();
	case OBS_ICON_TYPE_CUSTOM:
		return GetCustomIcon(id);
	case OBS_ICON_TYPE_PROCESS_AUDIO_OUTPUT:
		return GetAudioProcessOutputIcon();
	default:
		return GetDefaultIcon();
	}
}

void OBSBasic::SetImageIcon(const QIcon &icon)
{
	imageIcon = icon;
}

void OBSBasic::SetColorIcon(const QIcon &icon)
{
	colorIcon = icon;
}

void OBSBasic::SetSlideshowIcon(const QIcon &icon)
{
	slideshowIcon = icon;
}

void OBSBasic::SetAudioInputIcon(const QIcon &icon)
{
	audioInputIcon = icon;
}

void OBSBasic::SetAudioOutputIcon(const QIcon &icon)
{
	audioOutputIcon = icon;
}

void OBSBasic::SetDesktopCapIcon(const QIcon &icon)
{
	desktopCapIcon = icon;
}

void OBSBasic::SetWindowCapIcon(const QIcon &icon)
{
	windowCapIcon = icon;
}

void OBSBasic::SetGameCapIcon(const QIcon &icon)
{
	gameCapIcon = icon;
}

void OBSBasic::SetCameraIcon(const QIcon &icon)
{
	cameraIcon = icon;
}

void OBSBasic::SetTextIcon(const QIcon &icon)
{
	textIcon = icon;
}

void OBSBasic::SetMediaIcon(const QIcon &icon)
{
	mediaIcon = icon;
}

void OBSBasic::SetBrowserIcon(const QIcon &icon)
{
	browserIcon = icon;
}

void OBSBasic::SetGroupIcon(const QIcon &icon)
{
	groupIcon = icon;
}

void OBSBasic::SetSceneIcon(const QIcon &icon)
{
	sceneIcon = icon;
}

void OBSBasic::SetDefaultIcon(const QIcon &icon)
{
	defaultIcon = icon;
}

void OBSBasic::SetAudioProcessOutputIcon(const QIcon &icon)
{
	audioProcessOutputIcon = icon;
}

QIcon OBSBasic::GetImageIcon() const
{
	return imageIcon;
}

QIcon OBSBasic::GetColorIcon() const
{
	return colorIcon;
}

QIcon OBSBasic::GetSlideshowIcon() const
{
	return slideshowIcon;
}

QIcon OBSBasic::GetAudioInputIcon() const
{
	return audioInputIcon;
}

QIcon OBSBasic::GetAudioOutputIcon() const
{
	return audioOutputIcon;
}

QIcon OBSBasic::GetDesktopCapIcon() const
{
	return desktopCapIcon;
}

QIcon OBSBasic::GetWindowCapIcon() const
{
	return windowCapIcon;
}

QIcon OBSBasic::GetGameCapIcon() const
{
	return gameCapIcon;
}

QIcon OBSBasic::GetCameraIcon() const
{
	return cameraIcon;
}

QIcon OBSBasic::GetTextIcon() const
{
	return textIcon;
}

QIcon OBSBasic::GetMediaIcon() const
{
	return mediaIcon;
}

QIcon OBSBasic::GetBrowserIcon() const
{
	return browserIcon;
}

QIcon OBSBasic::GetGroupIcon() const
{
	return groupIcon;
}

QIcon OBSBasic::GetSceneIcon() const
{
	return sceneIcon;
}

QIcon OBSBasic::GetDefaultIcon() const
{
	return defaultIcon;
}

QIcon OBSBasic::GetAudioProcessOutputIcon() const
{
	return audioProcessOutputIcon;
}

QIcon OBSBasic::GetCustomIcon(const char *id) const
{
	const char *path = App()->IsThemeDark() ? obs_source_get_dark_icon(id) : obs_source_get_light_icon(id);
	QIcon icon = (path && *path) ? QIcon(path) : GetDefaultIcon();
	bfree((void *)path);

	return icon;
}
