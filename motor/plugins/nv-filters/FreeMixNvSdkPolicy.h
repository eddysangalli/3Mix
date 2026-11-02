#pragma once
#include <Windows.h>
#include <stdbool.h>
#ifdef __cplusplus
extern "C" {
#endif

enum freemix_nv_family { FREEMIX_NV_AFX, FREEMIX_NV_VFX };
struct freemix_nv_sdk_guard { HANDLE file; wchar_t canonical_path[MAX_PATH]; };

bool freemix_nv_sdk_enabled(enum freemix_nv_family family);
bool freemix_nv_sdk_begin(enum freemix_nv_family family, const char *path,
                         const char *file_name, struct freemix_nv_sdk_guard *guard);
void freemix_nv_sdk_end(struct freemix_nv_sdk_guard *guard);
const char *freemix_nv_sdk_reason(enum freemix_nv_family family);
#ifdef __cplusplus
}
#endif
