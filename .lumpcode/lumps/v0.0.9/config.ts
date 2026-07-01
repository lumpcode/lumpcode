import { LumpJsConfig } from '@lumpcode/cli-types';
import { taskListConfig } from '../../recipes/recipes/taskList';

export default {
    ...taskListConfig('ver/0.0.9'),
    discoveryBranch: 'ver/0.0.9',
} satisfies LumpJsConfig;