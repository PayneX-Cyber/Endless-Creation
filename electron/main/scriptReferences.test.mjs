import test from 'node:test';
import assert from 'node:assert/strict';

import { findSettingReferences } from './scriptReferences.ts';

function scene(id, title, referenceIds) {
  return { id, title, content: '', order: 0, referenceIds, createdAt: 'now', updatedAt: 'now' };
}

const scriptA = {
  id: 'script-a',
  projectId: 'default',
  title: '剧本甲',
  schemaVersion: 1,
  createdAt: 'now',
  updatedAt: 'now',
  episodes: [
    {
      id: 'episode-a',
      title: '第一集',
      order: 0,
      createdAt: 'now',
      updatedAt: 'now',
      scenes: [scene('scene-a', '开场', ['setting-1']), scene('scene-a2', '收尾', [])],
    },
  ],
};

const scriptB = {
  id: 'script-b',
  projectId: 'default',
  title: '剧本乙',
  schemaVersion: 1,
  createdAt: 'now',
  updatedAt: 'now',
  episodes: [
    {
      id: 'episode-b',
      title: '首集',
      order: 0,
      createdAt: 'now',
      updatedAt: 'now',
      scenes: [scene('scene-b', '登场', ['setting-1', 'setting-2'])],
    },
  ],
};

test('扫描跨剧本引用并返回位置', () => {
  const references = findSettingReferences([scriptA, scriptB], 'setting-1');
  assert.deepEqual(references.map((item) => item.scriptId), ['script-a', 'script-b']);
  assert.equal(references[0].sceneId, 'scene-a');
  assert.equal(references[0].scriptTitle, '剧本甲');
  assert.equal(references[0].episodeTitle, '第一集');
  assert.equal(references[0].sceneTitle, '开场');
});

test('未引用返回空数组', () => {
  assert.deepEqual(findSettingReferences([scriptA], 'missing'), []);
});

test('同一设定在多场次命中各返回一条', () => {
  const references = findSettingReferences([scriptB], 'setting-2');
  assert.equal(references.length, 1);
  assert.equal(references[0].sceneId, 'scene-b');
});
