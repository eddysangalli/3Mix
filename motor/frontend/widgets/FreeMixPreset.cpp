/******************************************************************************
    FreeMix: the open preset as a document.

    The engine writes every change of a scene collection to disk as it happens, so there is nothing to "discard".
    Here a copy of the preset file is kept next to it (same name plus ".salvo") holding the preset as it was when
    it was opened or last saved on purpose. On exit the operator chooses: keep the changes, or go back to that
    copy.

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

#include <models/SceneCollection.hpp>

#include <obs-frontend-api.h>

#include <filesystem>
#include <fstream>
#include <iterator>
#include <system_error>

namespace {

std::filesystem::path SavedCopyPath(const std::filesystem::path &preset)
{
	std::filesystem::path copy = preset;
	copy += ".salvo";
	return copy;
}

bool SameContent(const std::filesystem::path &a, const std::filesystem::path &b)
{
	std::error_code error;
	if (!std::filesystem::exists(a, error) || !std::filesystem::exists(b, error)) {
		return false;
	}
	if (std::filesystem::file_size(a, error) != std::filesystem::file_size(b, error)) {
		return false;
	}
	std::ifstream first(a, std::ios::binary), second(b, std::ios::binary);
	return std::equal(std::istreambuf_iterator<char>(first), std::istreambuf_iterator<char>(),
			  std::istreambuf_iterator<char>(second));
}

void OnFrontendEvent(enum obs_frontend_event event, void *)
{
	if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING || event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED) {
		OBSBasic::Get()->SnapshotPreset();
	}
}

} // namespace

void OBSBasic::InitPresetDocument()
{
	obs_frontend_add_event_callback(OnFrontendEvent, nullptr);
}

void OBSBasic::SnapshotPreset()
{
	try {
		const std::filesystem::path preset = GetCurrentSceneCollection().getFilePath();
		std::error_code error;
		if (std::filesystem::exists(preset, error)) {
			std::filesystem::copy_file(preset, SavedCopyPath(preset),
						   std::filesystem::copy_options::overwrite_existing, error);
		}
	} catch (const std::exception &error) {
		blog(LOG_WARNING, "[freemix] could not keep a copy of the preset: %s", error.what());
	}
}

void OBSBasic::SavePresetAsDocument()
{
	SaveProjectNow();
	SnapshotPreset();
}

bool OBSBasic::PresetHasChanges()
{
	try {
		SaveProjectNow();
		const std::filesystem::path preset = GetCurrentSceneCollection().getFilePath();
		return !SameContent(preset, SavedCopyPath(preset));
	} catch (const std::exception &) {
		return false;
	}
}

void OBSBasic::FinishPresetOnExit()
{
	try {
		const std::filesystem::path preset = GetCurrentSceneCollection().getFilePath();
		const std::filesystem::path copy = SavedCopyPath(preset);
		std::error_code error;
		if (discardPresetOnExit && std::filesystem::exists(copy, error)) {
			std::filesystem::copy_file(copy, preset, std::filesystem::copy_options::overwrite_existing, error);
			blog(LOG_INFO, "[freemix] changes to the preset discarded on exit");
		} else {
			std::filesystem::copy_file(preset, copy, std::filesystem::copy_options::overwrite_existing, error);
		}
	} catch (const std::exception &error) {
		blog(LOG_WARNING, "[freemix] could not finish the preset on exit: %s", error.what());
	}
}
