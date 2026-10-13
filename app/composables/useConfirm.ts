import { LazyConfirmDialog } from "#components";

type ButtonColor =
  | "primary"
  | "neutral"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error";

type ConfirmDialogProps = {
  title?: string;
  description?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  dismissible?: boolean;
  confirmColor?: ButtonColor;
  cancelColor?: ButtonColor;
};

export function useConfirm() {
  const overlay = useOverlay();

  const modal = overlay.create(LazyConfirmDialog);

  async function confirm(options: ConfirmDialogProps = {}): Promise<boolean> {
    const opened = modal.open(options);
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
