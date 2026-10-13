//
// doomgeneric platform port for the Lattice Grid demo.
//
// No SDL: the 320x200 framebuffer that doomgeneric renders into is handed to the
// host page frame-by-frame through dg_js_frame(), and the host page is the one
// responsible for turning it into a Lattice grid update. Key presses arrive the
// other way, through dg_key_event(), exported for the host page to call.
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//

#include "doomkeys.h"
#include "m_argv.h"
#include "doomgeneric.h"

#include <stdio.h>
#include <stdint.h>

#include <emscripten.h>

#define KEYQUEUE_SIZE 16

static unsigned short s_KeyQueue[KEYQUEUE_SIZE];
static unsigned int s_KeyQueueWriteIndex = 0;
static unsigned int s_KeyQueueReadIndex = 0;

EM_JS(void, dg_js_frame, (int ptr, int w, int h), {
  if (Module.onDoomFrame) Module.onDoomFrame(HEAPU8, ptr, w, h);
});

EM_JS(void, dg_js_title, (const char *title), {
  if (Module.onDoomTitle) Module.onDoomTitle(UTF8ToString(title));
});

void DG_Init()
{
}

void DG_DrawFrame()
{
  dg_js_frame((int)(intptr_t)DG_ScreenBuffer, DOOMGENERIC_RESX, DOOMGENERIC_RESY);
}

void DG_SleepMs(uint32_t ms)
{
  // The browser paces calls through emscripten_set_main_loop; TryRunTics()
  // only ever waits for a fraction of a tic here, so there is nothing to do.
}

uint32_t DG_GetTicksMs()
{
  return (uint32_t)emscripten_get_now();
}

int DG_GetKey(int* pressed, unsigned char* doomKey)
{
  if (s_KeyQueueReadIndex == s_KeyQueueWriteIndex)
  {
    return 0;
  }
  else
  {
    unsigned short keyData = s_KeyQueue[s_KeyQueueReadIndex];
    s_KeyQueueReadIndex++;
    s_KeyQueueReadIndex %= KEYQUEUE_SIZE;

    *pressed = keyData >> 8;
    *doomKey = keyData & 0xFF;

    return 1;
  }
}

void DG_SetWindowTitle(const char * title)
{
  dg_js_title(title);
}

// Called from the host page with a doom key code (see doomkeys.h) already
// resolved from the browser's KeyboardEvent; the mapping lives in JS so this
// file stays free of a second copy of the keycode table.
EMSCRIPTEN_KEEPALIVE
void dg_key_event(int pressed, int doomKey)
{
  unsigned short keyData = (unsigned short)(((pressed ? 1 : 0) << 8) | (doomKey & 0xFF));
  s_KeyQueue[s_KeyQueueWriteIndex] = keyData;
  s_KeyQueueWriteIndex++;
  s_KeyQueueWriteIndex %= KEYQUEUE_SIZE;
}

int main(int argc, char **argv)
{
  static char *fixedArgv[] = { "doomgeneric", "-iwad", "freedoom1.wad" };
  doomgeneric_Create(3, fixedArgv);

  // A fixed-rate setTimeout loop rather than requestAnimationFrame: rAF is
  // throttled to ~1Hz on a backgrounded/headless tab, which a benchmark or a
  // CI run would otherwise read as a hung engine rather than an idle one.
  emscripten_set_main_loop(doomgeneric_Tick, 60, 1);

  return 0;
}
