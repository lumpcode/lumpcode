import { describe, it, expect } from 'vitest';
import { getCodeBasePaths } from './main';

const cwd = process.cwd();

describe('getCodeBasePaths', () => {
  it('should return file paths for the current codebase', async () => {    
    const result = await getCodeBasePaths({ cwd });

    if (!result.success) {
        throw new Error(result.data.message);
    }

    const codeBasePaths = result.data;
    
    expect(Array.isArray(codeBasePaths)).toBe(true);
    
    expect(codeBasePaths.length).toBeGreaterThan(0);
    
    codeBasePaths.forEach((item) => {
      expect(item).toHaveProperty('path');
      expect(item).toHaveProperty('isDir');
      expect(typeof item.path).toBe('string');
      expect(typeof item.isDir).toBe('boolean');
    });
    
    const directories = codeBasePaths.filter(item => item.isDir);
    const files = codeBasePaths.filter(item => !item.isDir);
    
    expect(directories.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
    
    const paths = codeBasePaths.map(item => item.path);
    expect(paths.some(path => path.includes('package.json'))).toBe(true);
    expect(paths.some(path => path.includes('src'))).toBe(true);
  });

  it('should handle invalid directory gracefully', async () => {
    const invalidCwd = '/non/existent/directory/12345';
    
    const result = await getCodeBasePaths({ cwd: invalidCwd });

    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('message');
  });

  it('should exclude files matching .gitignore patterns', async () => {
    const result = await getCodeBasePaths({ cwd });

    if (!result.success) {
        throw new Error(result.data.message);
    }

    const codeBasePaths = result.data;
    const paths = codeBasePaths.map(item => item.path);

    const hasNodeModules = paths.some(path => path.includes('node_modules'));
    expect(hasNodeModules).toBe(false);
  });
});
