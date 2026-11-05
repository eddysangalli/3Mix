#include "OBSBasic.hpp"
#include <models/SceneCollection.hpp>
#include <filesystem>
#include <fstream>
#include <iterator>
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
