import type { ComponentPublicInstance } from "vue";
import { LazyConfirmDialog } from "#components";

type ConfirmDialogProps = {
  title?: string;
  description?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  dismissible?: boolean;
  confirmColor?: string;
  cancelColor?: string;
};

type OverlayApi<T extends ComponentPublicInstance = ComponentPublicInstance> = {
  open: (props?: Record<string, any>) => Promise<T>;
  close: (value?: any) => void;
  patch: (props: Record<string, any>) => void;
};

export function useConfirm() {
  const overlay = useOverlay();

  const modal = overlay.create(LazyConfirmDialog) as unknown as OverlayApi;

  async function confirm(options: ConfirmDialogProps = {}): Promise<boolean> {
    const opened: any = modal.open(options);
    try {
      const result = await opened.result;
      return Boolean(result);
    } catch {
      return false;
    }
  }

  return {
    confirm,
  };
}
