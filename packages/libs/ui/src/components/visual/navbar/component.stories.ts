import type { Meta, StoryObj } from '@storybook/vue3-vite';

import Navbar from './component.vue';
import type { NavbarProps } from './typings';

const meta = {
  title: 'Visual/Navbar',
  component: Navbar,
  tags: ['autodocs'],
  argTypes: {},
} satisfies Meta<NavbarProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    mainIcon: {
      name: 'lumpcode',
      color: 'white',
      size: 3,
    }
  }
};