/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { diagnose, formatDoctorReport } from '../src/doctor/DocsDoctor';
import { ControllerInfo } from '../src/scanner/ScannerService';

function controller(overrides: Partial<ControllerInfo> = {}): ControllerInfo {
  return {
    name: 'UsersController',
    path: 'users',
    methods: [],
    ...overrides,
  };
}

const perfectMethod = {
  name: 'findAll',
  httpMethod: 'GET',
  route: '',
  summary: 'List all users',
  parameters: [],
  returnType: {
    type: 'UserDto',
    isArray: true,
    isOptional: false,
    properties: [
      { name: 'id', type: { type: 'number', isArray: false, isOptional: false } },
    ],
  },
};

describe('DocsDoctor', () => {
  it('gives a perfect score to fully documented endpoints', () => {
    const report = diagnose([controller({ methods: [perfectMethod] })]);

    expect(report.score).toBe(100);
    expect(report.grade).toBe('A');
    expect(report.issues).toHaveLength(0);
    expect(report.endpointCount).toBe(1);
  });

  it('flags missing return types as errors', () => {
    const report = diagnose([
      controller({
        methods: [
          {
            ...perfectMethod,
            returnType: { type: 'any', isArray: false, isOptional: false },
          },
        ],
      }),
    ]);

    expect(report.score).toBeLessThan(100);
    expect(report.stats.errors).toBe(1);
    expect(report.issues[0].code).toBe('missing-return-type');
    expect(report.issues[0].controller).toBe('UsersController');
  });

  it('accepts void return types (204-style endpoints)', () => {
    const report = diagnose([
      controller({
        methods: [
          {
            ...perfectMethod,
            returnType: { type: 'void', isArray: false, isOptional: false },
          },
        ],
      }),
    ]);

    expect(report.issues.filter(i => i.code === 'missing-return-type')).toHaveLength(0);
  });

  it('flags untyped parameters as warnings', () => {
    const report = diagnose([
      controller({
        methods: [
          {
            ...perfectMethod,
            parameters: [
              {
                name: 'body',
                parameterLocation: 'body' as const,
                type: { type: 'any', isArray: false, isOptional: false },
              },
            ],
          },
        ],
      }),
    ]);

    const codes = report.issues.map(i => i.code);
    expect(codes).toContain('untyped-parameter');
    expect(codes).toContain('opaque-body');
  });

  it('hints when a body DTO has no class-validator decorators', () => {
    const report = diagnose([
      controller({
        methods: [
          {
            ...perfectMethod,
            parameters: [
              {
                name: 'dto',
                parameterLocation: 'body' as const,
                type: {
                  type: 'CreateUserDto',
                  isArray: false,
                  isOptional: false,
                  properties: [
                    { name: 'email', type: { type: 'string', isArray: false, isOptional: false } },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ]);

    expect(report.issues.map(i => i.code)).toContain('unvalidated-body');
  });

  it('gives full body points when validation decorators are present', () => {
    const report = diagnose([
      controller({
        methods: [
          {
            ...perfectMethod,
            parameters: [
              {
                name: 'dto',
                parameterLocation: 'body' as const,
                type: {
                  type: 'CreateUserDto',
                  isArray: false,
                  isOptional: false,
                  properties: [
                    {
                      name: 'email',
                      type: { type: 'string', isArray: false, isOptional: false },
                      validation: { format: 'email' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ]);

    expect(report.score).toBe(100);
  });

  it('flags missing summaries as hints', () => {
    const report = diagnose([
      controller({ methods: [{ ...perfectMethod, summary: undefined }] }),
    ]);

    expect(report.stats.hints).toBe(1);
    expect(report.issues[0].code).toBe('missing-summary');
  });

  it('scores an empty project as zero', () => {
    const report = diagnose([]);

    expect(report.score).toBe(0);
    expect(report.grade).toBe('F');
  });

  it('renders a human-readable report', () => {
    const report = diagnose([
      controller({ methods: [{ ...perfectMethod, summary: undefined }] }),
    ]);
    const text = formatDoctorReport(report);

    expect(text).toContain('Documentation Health Report');
    expect(text).toContain('Score:');
    expect(text).toContain('missing-summary');
  });

  it('renders a success message for perfect projects', () => {
    const report = diagnose([controller({ methods: [perfectMethod] })]);

    expect(formatDoctorReport(report)).toContain('Perfect!');
  });
});
