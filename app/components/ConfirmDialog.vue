<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    dismissible?: boolean;
    /**
     * Color of the confirm button. Examples: 'primary', 'success', 'warning', 'error', 'neutral', 'secondary'
     */
    confirmColor?:
      | "primary"
      | "neutral"
      | "secondary"
      | "success"
      | "info"
      | "warning"
      | "error";
    /**
     * Color of the cancel button.
     */
    cancelColor?:
      | "primary"
      | "neutral"
      | "secondary"
      | "success"
      | "info"
      | "warning"
      | "error";
  }>(),
  {
    title: "Confirm action",
    description: undefined,
    message: undefined,
    confirmText: "Confirm",
    cancelText: "Cancel",
    dismissible: true,
    confirmColor: "primary",
    cancelColor: "neutral",
  }
);

const emit = defineEmits<{ close: [boolean] }>();

function onCancel() {
  emit("close", false);
}

function onConfirm() {
  emit("close", true);
}
</script>

<template>
  <UModal
    :title="props.title"
    :description="props.description"
    :dismissible="props.dismissible"
  >
    <template #body>
      <p v-if="props.message">
        {{ props.message }}
      </p>
      <slot v-else name="body" />
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          :color="props.cancelColor"
          variant="outline"
          :label="props.cancelText"
          @click="onCancel"
        />
        <UButton
          :color="props.confirmColor"
          :label="props.confirmText"
          @click="onConfirm"
        />
      </div>
    </template>
  </UModal>
</template>
