import { Preview, setup } from "@storybook/vue3";
import { lumpcodeUiPlugin } from "../src/plugin";

setup((app) => {
  app.use(lumpcodeUiPlugin);
});

export const parameters: Preview['parameters'] = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
}