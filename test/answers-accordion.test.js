import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnswerCards } from '../public/dashboard/requirements/answers.js';

test('questions start collapsed with native summaries exposing title and human approval badge', () => {
  const html = renderAnswerCards([
    { id: 'q"1', question: '<Question>', answerStatus: 'approved', answer: 'Yes' },
    { id: 'q2', question: 'Unanswered' },
    { id: 'q3', question: 'Draft', answerStatus: 'draft' },
    { id: 'q4', question: 'Rejected', answerStatus: 'rejected' },
  ]);
  const cards = [...html.matchAll(/<details class="answers-card"([^>]*)>\s*<summary[^>]*>([\s\S]*?)<\/summary>/g)];
  assert.equal(cards.length, 4);
  assert.ok(cards.every(([, attributes]) => !/\bopen\b/.test(attributes)));
  assert.match(cards[0][1], /data-answer-question-id="q&quot;1"/);
  assert.match(cards[0][2], /&lt;Question&gt;/);
  assert.match(cards[0][2], />Aprobada</);
  for (const [, , summary] of cards.slice(1)) assert.match(summary, />Pendiente</);
  assert.match(html, /Estado: Borrador/);
  assert.match(html, /Estado: Propuesta rechazada/);
  assert.doesNotMatch(html, /<Question>/);
});
