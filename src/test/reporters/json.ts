/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import EmptyReporter from './empty';
import { FullConfig, Test, Suite, TestResult, TestError, FullResult, TestStatus } from '../reporter';

export interface JSONReport {
  config: Omit<FullConfig, 'projects'> & {
    projects: {
      outputDir: string,
      repeatEach: number,
      retries: number,
      metadata: any,
      name: string,
      testDir: string,
      testIgnore: string[],
      testMatch: string[],
      timeout: number,
    }[],
  };
  suites: JSONReportSuite[];
  errors: TestError[];
}
export interface JSONReportSuite {
  title: string;
  file: string;
  column: number;
  line: number;
  specs: JSONReportSpec[];
  suites?: JSONReportSuite[];
}
export interface JSONReportSpec {
  title: string;
  ok: boolean;
  tests: JSONReportTest[];
  file: string;
  line: number;
  column: number;
}
export interface JSONReportTest {
  timeout: number;
  annotations: { type: string, description?: string }[],
  expectedStatus: TestStatus;
  projectName: string;
  results: JSONReportTestResult[];
  status: 'skipped' | 'expected' | 'unexpected' | 'flaky';
}
export interface JSONReportTestResult {
  workerIndex: number;
  status: TestStatus | undefined;
  duration: number;
  error: TestError | undefined;
  stdout: JSONReportSTDIOEntry[],
  stderr: JSONReportSTDIOEntry[],
  retry: number;
  data: { [key: string]: any },
}
export type JSONReportSTDIOEntry = { text: string } | { buffer: string };

function toPosixPath(aPath: string): string {
  return aPath.split(path.sep).join(path.posix.sep);
}

class JSONReporter extends EmptyReporter {
  config!: FullConfig;
  suite!: Suite;
  private _errors: TestError[] = [];
  private _outputFile: string | undefined;

  constructor(options: { outputFile?: string } = {}) {
    super();
    this._outputFile = options.outputFile;
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.suite = suite;
  }

  onError(error: TestError): void {
    this._errors.push(error);
  }

  async onEnd(result: FullResult) {
    outputReport(this._serializeReport(), this._outputFile);
  }

  private _serializeReport(): JSONReport {
    return {
      config: {
        ...this.config,
        rootDir: toPosixPath(this.config.rootDir),
        projects: this.config.projects.map(project => {
          return {
            outputDir: toPosixPath(project.outputDir),
            repeatEach: project.repeatEach,
            retries: project.retries,
            metadata: project.metadata,
            name: project.name,
            testDir: toPosixPath(project.testDir),
            testIgnore: serializePatterns(project.testIgnore),
            testMatch: serializePatterns(project.testMatch),
            timeout: project.timeout,
          };
        })
      },
      suites: this._mergeSuites(this.suite.suites),
      errors: this._errors
    };
  }

  private _mergeSuites(suites: Suite[]): JSONReportSuite[] {
    debugger;
    const fileSuites = new Map<string, JSONReportSuite>();
    const result: JSONReportSuite[] = [];
    for (const suite of suites) {
      if (!fileSuites.has(suite.file)) {
        const serialized = this._serializeSuite(suite);
        if (serialized) {
          fileSuites.set(suite.file, serialized);
          result.push(serialized);
        }
      } else {
        this._mergeTestsFromSuite(fileSuites.get(suite.file)!, suite);
      }
    }
    return result;
  }

  private _mergeTestsFromSuite(to: JSONReportSuite, from: Suite) {
    for (const fromSuite of from.suites) {
      const toSuite = (to.suites || []).find(s => s.title === fromSuite.title && s.file === toPosixPath(path.relative(this.config.rootDir, fromSuite.file)) && s.line === fromSuite.line && s.column === fromSuite.column);
      if (toSuite) {
        this._mergeTestsFromSuite(toSuite, fromSuite);
      } else {
        const serialized = this._serializeSuite(fromSuite);
        if (serialized) {
          if (!to.suites)
            to.suites = [];
          to.suites.push(serialized);
        }
      }
    }
    for (const test of from.tests) {
      const toSpec = to.specs.find(s => s.title === test.title && s.file === toPosixPath(path.relative(this.config.rootDir, test.file)) && s.line === test.line && s.column === test.column);
      if (toSpec)
        toSpec.tests.push(this._serializeTest(test));
      else
        to.specs.push(this._serializeTestSpec(test));
    }
  }

  private _serializeSuite(suite: Suite): null | JSONReportSuite {
    if (!suite.findTest(test => true))
      return null;
    const suites = suite.suites.map(suite => this._serializeSuite(suite)).filter(s => s) as JSONReportSuite[];
    return {
      title: suite.title,
      file: toPosixPath(path.relative(this.config.rootDir, suite.file)),
      line: suite.line,
      column: suite.column,
      specs: suite.tests.map(test => this._serializeTestSpec(test)),
      suites: suites.length ? suites : undefined,
    };
  }

  private _serializeTestSpec(test: Test): JSONReportSpec {
    return {
      title: test.title,
      ok: test.ok(),
      tests: [ this._serializeTest(test) ],
      file: toPosixPath(path.relative(this.config.rootDir, test.file)),
      line: test.line,
      column: test.column,
    };
  }

  private _serializeTest(test: Test): JSONReportTest {
    return {
      timeout: test.timeout,
      annotations: test.annotations,
      expectedStatus: test.expectedStatus,
      projectName: test.projectName,
      results: test.results.map(r => this._serializeTestResult(r)),
      status: test.status(),
    };
  }

  private _serializeTestResult(result: TestResult): JSONReportTestResult {
    return {
      workerIndex: result.workerIndex,
      status: result.status,
      duration: result.duration,
      error: result.error,
      stdout: result.stdout.map(s => stdioEntry(s)),
      stderr: result.stderr.map(s => stdioEntry(s)),
      retry: result.retry,
      data: result.data,
    };
  }
}

function outputReport(report: JSONReport, outputFile: string | undefined) {
  const reportString = JSON.stringify(report, undefined, 2);
  outputFile = outputFile || process.env[`PLAYWRIGHT_JSON_OUTPUT_NAME`];
  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, reportString);
  } else {
    console.log(reportString);
  }
}

function stdioEntry(s: string | Buffer): any {
  if (typeof s === 'string')
    return { text: s };
  return { buffer: s.toString('base64') };
}

function serializePatterns(patterns: string | RegExp | (string | RegExp)[]): string[] {
  if (!Array.isArray(patterns))
    patterns = [patterns];
  return patterns.map(s => s.toString());
}

export default JSONReporter;
