import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialScript,
  addEpisode,
  renameEpisode,
  moveEpisode,
  removeEpisode,
  addScene,
  updateScene,
  moveScene,
  removeScene,
  cloneScriptSnapshot,
} from './scriptDomain.ts';

test('新剧本自动包含第一集第一场', () => {
  const script = createInitialScript('default', '试写');
  assert.equal(script.projectId, 'default');
  assert.equal(script.title, '试写');
  assert.equal(script.schemaVersion, 1);
  assert.equal(script.episodes.length, 1);
  assert.equal(script.episodes[0].scenes.length, 1);
  assert.equal(script.episodes[0].scenes[0].content, '');
  assert.deepEqual(script.episodes[0].scenes[0].referenceIds, []);
});

test('新剧本缺省标题回退为未命名剧本', () => {
  const script = createInitialScript('default');
  assert.equal(script.title, '未命名剧本');
});

test('addEpisode 追加集并含一个空场次且不修改原对象', () => {
  const source = createInitialScript('default');
  const next = addEpisode(source);
  assert.equal(source.episodes.length, 1);
  assert.equal(next.episodes.length, 2);
  assert.equal(next.episodes[1].scenes.length, 1);
  assert.equal(next.episodes[1].scenes[0].content, '');
  assert.deepEqual(next.episodes.map((item) => item.order), [0, 1]);
});

test('renameEpisode 改标题不动其他字段', () => {
  const source = createInitialScript('default');
  const episodeId = source.episodes[0].id;
  const next = renameEpisode(source, episodeId, '开篇');
  assert.equal(next.episodes[0].title, '开篇');
  assert.equal(source.episodes[0].title !== '开篇', true);
  assert.notEqual(next, source);
});

test('不能删除最后一集或最后一场', () => {
  const script = createInitialScript('default');
  assert.throws(() => removeEpisode(script, script.episodes[0].id), /至少保留一集/);
  assert.throws(
    () => removeScene(script, script.episodes[0].id, script.episodes[0].scenes[0].id),
    /至少保留一个场次/,
  );
});

test('排序归一且不修改原对象', () => {
  const source = addEpisode(createInitialScript('default'));
  const moved = moveEpisode(source, source.episodes[1].id, -1);
  assert.deepEqual(moved.episodes.map((item) => item.order), [0, 1]);
  assert.equal(moved.episodes[0].id, source.episodes[1].id);
  assert.notEqual(moved, source);
});

test('moveEpisode 边界方向不越界', () => {
  const source = createInitialScript('default');
  const moved = moveEpisode(source, source.episodes[0].id, -1);
  assert.deepEqual(moved.episodes.map((item) => item.id), source.episodes.map((item) => item.id));
});

test('addScene 追加场次并返回新场次 id', () => {
  const source = createInitialScript('default');
  const episodeId = source.episodes[0].id;
  const { script, sceneId } = addScene(source, episodeId);
  assert.equal(script.episodes[0].scenes.length, 2);
  assert.equal(script.episodes[0].scenes[1].id, sceneId);
  assert.deepEqual(script.episodes[0].scenes.map((item) => item.order), [0, 1]);
  assert.equal(source.episodes[0].scenes.length, 1);
});

test('updateScene 局部更新标题正文与引用', () => {
  const source = createInitialScript('default');
  const episodeId = source.episodes[0].id;
  const sceneId = source.episodes[0].scenes[0].id;
  const next = updateScene(source, episodeId, sceneId, { title: '场一', content: '正文', referenceIds: ['s1'] });
  assert.equal(next.episodes[0].scenes[0].title, '场一');
  assert.equal(next.episodes[0].scenes[0].content, '正文');
  assert.deepEqual(next.episodes[0].scenes[0].referenceIds, ['s1']);
  assert.equal(source.episodes[0].scenes[0].content, '');
});

test('moveScene 归一 order 且不修改原对象', () => {
  const base = createInitialScript('default');
  const episodeId = base.episodes[0].id;
  const { script: withScene } = addScene(base, episodeId);
  const secondSceneId = withScene.episodes[0].scenes[1].id;
  const moved = moveScene(withScene, episodeId, secondSceneId, -1);
  assert.deepEqual(moved.episodes[0].scenes.map((item) => item.order), [0, 1]);
  assert.equal(moved.episodes[0].scenes[0].id, secondSceneId);
  assert.notEqual(moved, withScene);
});

test('removeScene 删除非最后场次并归一', () => {
  const base = createInitialScript('default');
  const episodeId = base.episodes[0].id;
  const { script: withScene } = addScene(base, episodeId);
  const firstSceneId = withScene.episodes[0].scenes[0].id;
  const next = removeScene(withScene, episodeId, firstSceneId);
  assert.equal(next.episodes[0].scenes.length, 1);
  assert.equal(next.episodes[0].scenes[0].order, 0);
});

test('removeEpisode 删除非最后一集并归一', () => {
  const source = addEpisode(createInitialScript('default'));
  const firstId = source.episodes[0].id;
  const next = removeEpisode(source, firstId);
  assert.equal(next.episodes.length, 1);
  assert.equal(next.episodes[0].order, 0);
  assert.equal(next.episodes[0].id, source.episodes[1].id);
});

test('撤销快照保留完整正文且与 draft 隔离', () => {
  const source = createInitialScript('default');
  source.episodes[0].scenes[0].content = '完整正文';
  const snapshot = cloneScriptSnapshot(source);
  source.episodes[0].scenes[0].content = '后来修改';
  assert.equal(snapshot.episodes[0].scenes[0].content, '完整正文');
  assert.equal(snapshot.id, source.id);
});
