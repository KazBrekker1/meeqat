export default defineAppConfig({
  app: {
    name: "Meeqat",
  },
  ui: {
    colors: {
      primary: "indigo",
      neutral: "zinc",
    },
    button: {
      slots: {
        base: "cursor-pointer",
      },
    },
    select: {
      slots: {
        base: "cursor-pointer",
      },
    },
    selectMenu: {
      slots: {
        base: "cursor-pointer",
      },
    },
    navigationMenu: {
      slots: {
        link: "cursor-pointer",
      },
      variants: {
        disabled: {
          true: {
            link: "cursor-text",
          },
        },
      },
    },
  },
});
