import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { SignupFormProps } from './typings';
import SignupForm from './component.vue';

const meta = {
  title: 'Concrete/SignupForm',
  render: (args) => ({
    components: { SignupForm },
    setup() {
      return { args };
    },
    template: /*html*/`
    <div style="width: 100%; display: flex;">
        <div style="width: 250px;">
          <SignupForm v-bind="args" />
        </div>
    </div>
    `,
  }),
  tags: ['autodocs'],
  argTypes: {},
} satisfies Meta<SignupFormProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    onSubmit: (data) => console.log(data),
  },
};

