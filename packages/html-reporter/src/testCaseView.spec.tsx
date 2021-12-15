/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import { test, expect } from '../test/componentTest';
import { TestCaseView } from './testCaseView';
import type { TestCase, TestResult } from '../../playwright-test/src/reporters/html';

test.use({ webpack: require.resolve('../webpack.config.js') });
test.use({ viewport: { width: 800, height: 600 } });

const result: TestResult = {
  retry: 0,
  startTime: new Date(0).toUTCString(),
  duration: 100,
  steps: [{
    title: 'Outer step',
    startTime: new Date(100).toUTCString(),
    duration: 10,
    location: { file: 'test.spec.ts', line: 62, column: 0 },
    steps: [{
      title: 'Inner step',
      startTime: new Date(200).toUTCString(),
      duration: 10,
      location: { file: 'test.spec.ts', line: 82, column: 0 },
      steps: [],
    }],
  }],
  attachments: [],
  status: 'passed',
};

const testCase: TestCase = {
  testId: 'testid',
  title: 'My test',
  path: [],
  projectName: 'chromium',
  location: { file: 'test.spec.ts', line: 42, column: 0 },
  annotations: [
    { type: 'annotation', description: 'Annotation text' },
    { type: 'annotation', description: 'Another annotation text' },
  ],
  outcome: 'expected',
  duration: 10,
  ok: true,
  results: [result]
};

test('should render counters', async ({ render }) => {
  const component = await render(<TestCaseView projectNames={['chromium', 'webkit']} test={testCase}></TestCaseView>);
  await expect(component.locator('text=Annotation text').first()).toBeVisible();
  await component.locator('text=Annotations').click();
  await expect(component.locator('text=Annotation text')).not.toBeVisible();
  await expect(component.locator('text=Outer step')).toBeVisible();
  await expect(component.locator('text=Inner step')).not.toBeVisible();
  await component.locator('text=Outer step').click();
  await expect(component.locator('text=Inner step')).toBeVisible();
  await expect(component.locator('text=test.spec.ts:42')).toBeVisible();
  await expect(component.locator('text=My test')).toBeVisible();
});