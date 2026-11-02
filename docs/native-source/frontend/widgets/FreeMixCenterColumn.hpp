/******************************************************************************
    FreeMix: what the column between Preview and Output has besides the transitions.

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

#pragma once

#include <QString>

class QWidget;

/* Buttons of the eight overlay channels: lit while the channel is on air; a click puts the Preview input on the
 * channel, or takes it off. */
QWidget *FreeMixCreateOverlayButtons(QWidget *parent);
QWidget *FreeMixCreateClocks(QWidget *parent);

/* Bounds the last DSK row to finish on the same line as the given widget (the Talkback). */
void FreeMixDskBindBottomLine(QWidget *dsk, QWidget *talk);

/* Opens the panel's clock selection (the same editor used by the top bar). */
void FreeMixOpenClocks();

/* Renders the three production clocks selected in the panel, for the center column. */
QString FreeMixCenterClockHtml();

/* Momentary talkback from the center column, using the private director mic prepared in Calls.
 * It shares the native watchdog and the same ApplyTalkback path as the Calls panel. */
void FreeMixTalkbackPress(bool on);
bool FreeMixTalkbackReady();
bool FreeMixTalkbackActive();
void FreeMixTalkbackKeepAlive();

/* Vertical stereo level meter of the Master (output track 1). */
QWidget *FreeMixCreateMasterMeter(QWidget *parent);

/* Levels the meter is showing, in dB (-60 = silence). False when there is no meter on screen. Interface thread. */
bool FreeMixMasterLevel(float &leftDb, float &rightDb);
