import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { LoginFormProps } from './typings';
import LoginForm from './component.vue';

const meta = {
  title: 'Concrete/LoginForm',
  render: (args) => ({
    components: { LoginForm },
    setup() {
      return { args };
    },
    template: /*html*/`
    <div style="width: 100%; display: flex;">
        <div style="width: 250px;">
          <LoginForm v-bind="args" />
        </div>
    </div>
    `,
  }),
  tags: ['autodocs'],
  argTypes: {},
} satisfies Meta<LoginFormProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    onSubmit: (data) => console.log(data),
  },
};