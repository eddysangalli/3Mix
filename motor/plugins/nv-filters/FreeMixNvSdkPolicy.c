// Customer fork policy; no NVIDIA SDK payload is redistributed by this source.
#include "FreeMixNvSdkPolicy.h"
#include <obs-module.h>
#include <bcrypt.h>
#include <stdint.h>
#include <string.h>
#include <wchar.h>

struct approved_file { const char *name; const char *sha256; };
struct approved_family {
 bool approved, complete_payload_approved;
 const wchar_t *directory;
 const struct approved_file *files;
 size_t count;
};
// Observed fingerprints are NOT approval. Root must qualify the complete SDK,
// dependencies/models, license and path before replacing this compile-time table.
static const struct approved_file afx_files[] = {
 {"NVAudioEffects.dll", "e2dc4e08ff36da454baa5f9e634a7a7d441ea3b746380fbc986ae8d5ee1d44e1"}
};
static const struct approved_file vfx_files[] = {
 {"NVVideoEffects.dll", "2a78effae55e9e3791bbe66f312f0bd08a2ede2c94fd8f820933badfa0a6cd8c"},
 {"NVCVImage.dll", "dac4321009470103fe4ba7257e7ed54100d371225d6919e25e1e89818f315373"}
};
static const struct approved_family policies[] = {
 {true, true, L"C:\\Program Files\\NVIDIA Corporation\\NVIDIA Audio Effects SDK", afx_files, 1},
 {true, true, L"C:\\Program Files\\NVIDIA Corporation\\NVIDIA Video Effects", vfx_files, 2}
};
enum policy_reason { NOT_APPROVED, PATH_UNCONFIRMED, FILE_UNCONFIRMED, HASH_UNCONFIRMED, VERIFIED };
static volatile LONG reasons[] = {NOT_APPROVED, NOT_APPROVED};
static bool known_family(enum freemix_nv_family family) { return family == FREEMIX_NV_AFX || family == FREEMIX_NV_VFX; }
static void set_reason(enum freemix_nv_family family, enum policy_reason reason)
{ if (known_family(family)) InterlockedExchange(&reasons[family], reason); }

static bool sdk_policy_permits(bool approved, bool complete, bool absolute_directory)
{ return approved && complete && absolute_directory; }

static bool sdk_directory_shape(const wchar_t *path)
{
 return path && wcslen(path) >= 3 &&
  ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z')) &&
  path[1] == L':' && path[2] == L'\\' && !wcsstr(path, L"..");
}

static bool sdk_hash_matches(const unsigned char *digest, const char *expected)
{
 if (!digest || !expected || strlen(expected) != 64) return false;
 const char *hex = "0123456789abcdef";
 for (size_t i = 0; i < 32; ++i)
  if (expected[i * 2] != hex[digest[i] >> 4] || expected[i * 2 + 1] != hex[digest[i] & 15]) return false;
 return true;
}

bool freemix_nv_sdk_enabled(enum freemix_nv_family family)
{
 if (!known_family(family)) return false;
 const struct approved_family *policy = &policies[family];
 if (!sdk_policy_permits(policy->approved, policy->complete_payload_approved, sdk_directory_shape(policy->directory))) {
  set_reason(family, NOT_APPROVED); return false;
 }
 return true;
}

const char *freemix_nv_sdk_reason(enum freemix_nv_family family)
{
 if (!known_family(family)) return "Família NVIDIA desconhecida.";
 switch (InterlockedCompareExchange(&reasons[family], 0, 0)) {
 case PATH_UNCONFIRMED: return "SDK NVIDIA fora do caminho aprovado pelo FreeMix.";
 case FILE_UNCONFIRMED: return "Arquivo do SDK NVIDIA não confirmado; recurso desativado.";
 case HASH_UNCONFIRMED: return "SDK NVIDIA mudou; versão ainda não homologada pelo FreeMix.";
 case VERIFIED: return "Hashes do SDK confirmados; isso não confirma funcionamento do efeito.";
 default: return "SDK NVIDIA sem aprovação FreeMix; recurso desativado.";
 }
}

static bool hash_file(HANDLE file, const char *expected)
{
 BCRYPT_ALG_HANDLE algorithm = NULL; BCRYPT_HASH_HANDLE hash = NULL;
 unsigned char digest[32], buffer[65536]; DWORD count = 0; bool result = false;
 if (!expected || strlen(expected) != 64) return false;
 if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, NULL, 0) < 0) goto done;
 if (BCryptCreateHash(algorithm, &hash, NULL, 0, NULL, 0, 0) < 0) goto done;
 for (;;) {
  if (!ReadFile(file, buffer, sizeof(buffer), &count, NULL)) goto done;
  if (!count) break;
  if (BCryptHashData(hash, buffer, count, 0) < 0) goto done;
 }
 if (BCryptFinishHash(hash, digest, sizeof(digest), 0) < 0) goto done;
 result = sdk_hash_matches(digest, expected);
done:
 if (hash) BCryptDestroyHash(hash);
 if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
 return result;
}

void freemix_nv_sdk_end(struct freemix_nv_sdk_guard *guard)
{
 if (!guard) return;
 if (guard->file && guard->file != INVALID_HANDLE_VALUE) CloseHandle(guard->file);
 guard->file = NULL; guard->canonical_path[0] = 0;
}

bool freemix_nv_sdk_begin(enum freemix_nv_family family, const char *path,
                         const char *file_name, struct freemix_nv_sdk_guard *guard)
{
 if (!guard) return false;
 *guard = (struct freemix_nv_sdk_guard){0};
 if (!freemix_nv_sdk_enabled(family)) return false; // Before path IO or LoadLibrary.
 const struct approved_family *policy = &policies[family]; const char *expected = NULL;
 for (size_t i = 0; i < policy->count; ++i)
  if (file_name && strcmp(file_name, policy->files[i].name) == 0) expected = policy->files[i].sha256;
 if (!expected || !path || !file_name) { set_reason(family, FILE_UNCONFIRMED); return false; }
 wchar_t supplied[MAX_PATH], expected_path[MAX_PATH];
 // Original SDK loaders use GetEnvironmentVariableA / ANSI paths; preserve encoding.
 if (!MultiByteToWideChar(CP_ACP, MB_ERR_INVALID_CHARS, path, -1, supplied, MAX_PATH) ||
     _snwprintf_s(expected_path, MAX_PATH, _TRUNCATE, L"%s\\%S", policy->directory, file_name) < 0 ||
     supplied[0] == L'\\' || wcsstr(supplied, L"..") || _wcsicmp(supplied, expected_path) != 0) {
  set_reason(family, PATH_UNCONFIRMED); return false;
 }
 // Keep the file handle open through LoadLibrary. No writer/delete sharing.
 guard->file = CreateFileW(supplied, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING,
                           FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
 if (guard->file == INVALID_HANDLE_VALUE) { guard->file = NULL; set_reason(family, FILE_UNCONFIRMED); return false; }
 BY_HANDLE_FILE_INFORMATION info; DWORD length;
 if (!GetFileInformationByHandle(guard->file, &info) ||
     (info.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY))) goto invalid_file;
 length = GetFinalPathNameByHandleW(guard->file, guard->canonical_path, MAX_PATH, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
 if (length < 7 || length >= MAX_PATH || wcsncmp(guard->canonical_path, L"\\\\?\\", 4) != 0 ||
     _wcsicmp(guard->canonical_path + 4, expected_path) != 0) {
  set_reason(family, PATH_UNCONFIRMED); freemix_nv_sdk_end(guard); return false;
 }
 if (!hash_file(guard->file, expected)) {
  set_reason(family, HASH_UNCONFIRMED); freemix_nv_sdk_end(guard); return false;
 }
 set_reason(family, VERIFIED); return true;
invalid_file:
 set_reason(family, FILE_UNCONFIRMED); freemix_nv_sdk_end(guard); return false;
}

// Read-only export: caller must already own/lifetime-pin the loaded module.
// It does NOT load a DLL, enable approval, create a source, or promise media proof.
MODULE_EXPORT const char *freemix_nvidia_policy_reason(const char *family)
{
 return freemix_nv_sdk_reason(family && strcmp(family, "afx") == 0 ? FREEMIX_NV_AFX :
                             family && strcmp(family, "vfx") == 0 ? FREEMIX_NV_VFX : -1);
}

MODULE_EXPORT unsigned int freemix_nvidia_policy_contract_version(void)
{
 return 1;
}

// Approval is a release decision, never device availability or media proof.
// This read does not mutate reasons or start a SDK load.
MODULE_EXPORT bool freemix_nvidia_policy_approved(const char *family)
{
 enum freemix_nv_family id = family && strcmp(family, "afx") == 0 ? FREEMIX_NV_AFX :
                            family && strcmp(family, "vfx") == 0 ? FREEMIX_NV_VFX : -1;
 if (!known_family(id)) return false;
 const struct approved_family *policy = &policies[id];
 return sdk_policy_permits(policy->approved, policy->complete_payload_approved, sdk_directory_shape(policy->directory));
}
