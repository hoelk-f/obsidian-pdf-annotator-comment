import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  { ignores: ['node_modules/**', 'dist/**', '.test-artifacts/**', 'main.js', '**/*.mjs'] },
  ...obsidianmd.configs.recommended,
  { files: ['src/**/*.ts'], rules: { 'obsidianmd/ui/sentence-case': ['warn', { brands: ['Remark My Words', 'Obsidian', 'PDF.js'] }] }, languageOptions: { parserOptions: { projectService: true } } },
]);
