/**
 * Composable for debug time mocking.
 * Allows shifting time forward/backward for testing purposes.
 * The offset is shared across all components and synced with the Android widget.
 */

// Global state shared across all component instances
const mockTimeOffsetMs = ref(0);

export function useMockTime() {
  /**
   * Get the current time with mock offset applied.
   */
  function getNow(): Date {
    return new Date(Date.now() + mockTimeOffsetMs.value);
  }

  /**
   * Get the current offset in milliseconds.
   */
  function getOffset(): number {
    return mockTimeOffsetMs.value;
  }

  /**
   * Set the mock time offset.
   * Also syncs with Android widget if available.
   */
  async function setOffset(offsetMs: number): Promise<void> {
    mockTimeOffsetMs.value = offsetMs;

    // Sync with Android widget
    if (import.meta.client) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("plugin:prayer-service|set_mock_time_offset", { offsetMs });
      } catch (e) {
        console.error("Failed to sync time offset with Android:", e);
      }
    }
  }

  /**
   * Add to the current offset (jump time forward/backward).
   */
  async function jumpTime(deltaMs: number): Promise<void> {
    await setOffset(mockTimeOffsetMs.value + deltaMs);
  }

  /**
   * Clear the offset (reset to real time).
   */
  async function clearOffset(): Promise<void> {
    await setOffset(0);
  }

  /**
   * Load the offset from Android (call on mount).
   */
  async function loadOffset(): Promise<void> {
    if (import.meta.client) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ offsetMs: number }>(
          "plugin:prayer-service|get_mock_time_offset"
        );
        mockTimeOffsetMs.value = result.offsetMs;
      } catch (e) {
        // Not on Android or command not available
      }
    }
  }

  /**
   * Format the offset for display.
   */
  function formatOffset(offsetMs: number): string {
    if (offsetMs === 0) return "None";

    const sign = offsetMs > 0 ? "+" : "-";
    const absMs = Math.abs(offsetMs);
    const hours = Math.floor(absMs / (1000 * 60 * 60));
    const minutes = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0 && minutes > 0) {
      return `${sign}${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${sign}${hours}h`;
    } else {
      return `${sign}${minutes}m`;
    }
  }

  return {
    mockTimeOffsetMs: readonly(mockTimeOffsetMs),
    getNow,
    getOffset,
    setOffset,
    jumpTime,
    clearOffset,
    loadOffset,
    formatOffset,
  };
}
