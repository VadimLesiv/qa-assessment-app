/**
 * Seeds the starter curriculum.
 *
 * Safe to re-run: sections are matched by slug and replaced, so editing the
 * content below and re-seeding updates the decks without duplicating them.
 * Player progress lives in separate tables and is never touched here.
 */
import { PrismaClient } from '@prisma/client';
import type { Difficulty, SectionTrack } from '@qa/shared';

const prisma = new PrismaClient();

interface SeedCard {
  front: string;
  back: string;
  bullets?: string[];
}

interface SeedQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
}

interface SeedSubSection {
  name: string;
  description: string;
  cards: SeedCard[];
  questions?: SeedQuestion[];
}

interface SeedSection {
  name: string;
  slug: string;
  track: SectionTrack;
  description: string;
  icon: string;
  accent: string;
  subSections: SeedSubSection[];
}

const CURRICULUM: SeedSection[] = [
  /* ================================ PROCESS ================================ */
  {
    name: 'QA Fundamentals',
    slug: 'qa-fundamentals',
    track: 'PROCESS',
    description: 'The vocabulary and principles every QA interview starts with.',
    icon: '🧭',
    accent: '#7c3aed',
    subSections: [
      {
        name: 'Testing Principles',
        description: 'The seven principles, and why "zero defects" is the wrong goal.',
        cards: [
          {
            front: 'What are the seven principles of software testing?',
            back: 'A shared baseline from the ISTQB syllabus that explains what testing can and cannot achieve.',
            bullets: [
              'Testing shows the presence of defects, not their absence',
              'Exhaustive testing is impossible',
              'Early testing saves time and money',
              'Defects cluster together',
              'Beware the pesticide paradox',
              'Testing is context dependent',
              'Absence-of-errors is a fallacy',
            ],
          },
          {
            front: 'What is the pesticide paradox?',
            back: 'Repeating the same tests stops finding new defects, because the code has already been hardened against exactly those cases. Test cases must be reviewed and varied regularly.',
            bullets: ['Rotate and extend test data', 'Add exploratory sessions', 'Review suites each release'],
          },
          {
            front: 'Why is "absence of errors" a fallacy?',
            back: 'A product can pass every test and still fail, if it solves the wrong problem. Finding and fixing defects does not help when the system does not meet user needs.',
            bullets: ['Validation vs verification', 'Requirements quality matters more than defect counts'],
          },
          {
            front: 'Verification vs Validation',
            back: 'Verification asks "are we building the product right?" - conformance to the specification. Validation asks "are we building the right product?" - fitness for the user need.',
            bullets: ['Verification: reviews, static analysis, unit tests', 'Validation: UAT, beta, usability testing'],
          },
          {
            front: 'What is the cost of defects curve?',
            back: 'The cost of fixing a defect rises sharply the later it is found. A requirements defect caught in review is cheap; the same defect found in production is orders of magnitude more expensive.',
            bullets: ['Requirements < Design < Code < Test < Production', 'Drives shift-left testing'],
          },
          {
            front: 'Quality Assurance vs Quality Control vs Testing',
            back: 'QA is process-oriented and preventive. QC is product-oriented and detective. Testing is one QC activity that executes the software to find defects.',
            bullets: ['QA: define and improve the process', 'QC: inspect the output', 'Testing: execute and observe'],
          },
        ],
        questions: [
          {
            prompt: 'A team runs the same regression suite every sprint and finds fewer defects each time. Which principle explains this?',
            options: ['Defect clustering', 'The pesticide paradox', 'Exhaustive testing is impossible', 'Early testing'],
            correctIndex: 1,
            explanation: 'Repeating identical tests stops revealing new defects; the suite must be reviewed and varied.',
            difficulty: 'EASY',
          },
          {
            prompt: 'Which statement best distinguishes validation from verification?',
            options: [
              'Validation checks conformance to the specification',
              'Validation is always automated',
              'Validation checks the product meets the actual user need',
              'Validation happens only after release',
            ],
            correctIndex: 2,
            explanation: 'Validation asks whether we built the right product; verification asks whether we built it right.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'Testing can prove a system is defect-free.',
            options: ['True', 'False'],
            correctIndex: 1,
            explanation: 'Testing shows the presence of defects, never their absence.',
            difficulty: 'EASY',
          },
          {
            prompt: 'Why does shift-left testing reduce project cost?',
            options: [
              'It reduces the number of testers needed',
              'Defects found earlier are cheaper to fix',
              'It removes the need for regression testing',
              'It makes exhaustive testing possible',
            ],
            correctIndex: 1,
            explanation: 'The cost of a defect grows with each phase it survives.',
            difficulty: 'MEDIUM',
          },
        ],
      },
      {
        name: 'SDLC & STLC Models',
        description: 'Waterfall, V-model, iterative and Agile - and where testing sits in each.',
        cards: [
          {
            front: 'What is the V-model?',
            back: 'A sequential model that pairs every development phase with a matching test level, so test design starts as soon as its corresponding specification exists.',
            bullets: [
              'Requirements <-> Acceptance testing',
              'System design <-> System testing',
              'Architecture <-> Integration testing',
              'Module design <-> Unit testing',
            ],
          },
          {
            front: 'What are the phases of the STLC?',
            back: 'The Software Testing Life Cycle runs in parallel with development and defines the testing work in each stage.',
            bullets: [
              'Requirement analysis',
              'Test planning',
              'Test case design and development',
              'Test environment setup',
              'Test execution',
              'Test cycle closure',
            ],
          },
          {
            front: 'What are entry and exit criteria?',
            back: 'Entry criteria are the conditions that must hold before a test phase starts; exit criteria define when it can be considered complete.',
            bullets: [
              'Entry: environment ready, build deployed, smoke passed',
              'Exit: coverage met, no open criticals, results signed off',
            ],
          },
          {
            front: 'Waterfall vs Agile testing',
            back: 'In Waterfall, testing is a distinct phase after development. In Agile, testing is continuous and happens inside every sprint, with the whole team owning quality.',
            bullets: ['Agile: short feedback loops, automation-heavy', 'Waterfall: formal documentation, late feedback'],
          },
          {
            front: 'What is shift-left testing?',
            back: 'Moving test activities earlier in the lifecycle - reviewing requirements, writing unit and contract tests, and running static analysis before any manual test execution.',
            bullets: ['Requirement reviews', 'TDD / BDD', 'Static analysis in CI', 'Contract tests'],
          },
        ],
      },
    ],
  },
  {
    name: 'Test Process & Documentation',
    slug: 'test-process-documentation',
    track: 'PROCESS',
    description: 'Planning, writing and reporting the artefacts a QA role is measured on.',
    icon: '📋',
    accent: '#0891b2',
    subSections: [
      {
        name: 'Test Planning & Strategy',
        description: 'What belongs in a test plan, and how strategy differs from plan.',
        cards: [
          {
            front: 'Test strategy vs test plan',
            back: 'A test strategy is an organisation-level, relatively static document describing the general approach. A test plan is project-specific and describes scope, schedule, resources and risks for one effort.',
            bullets: ['Strategy: long-lived, org-wide', 'Plan: per project or release'],
          },
          {
            front: 'What does a test plan contain? (IEEE 829)',
            back: 'A structured description of the testing effort that lets anyone pick up the project and understand what will be tested, how, by whom and when.',
            bullets: [
              'Scope: in and out',
              'Approach and test levels',
              'Entry and exit criteria',
              'Environment and tooling',
              'Roles and responsibilities',
              'Schedule and estimates',
              'Risks and mitigations',
            ],
          },
          {
            front: 'What makes a good test case?',
            back: 'It is independent, repeatable, traceable to a requirement, and precise enough that two testers reach the same verdict.',
            bullets: [
              'Unique ID and clear title',
              'Preconditions',
              'Numbered steps',
              'Expected result per step',
              'Traceability to a requirement',
            ],
          },
          {
            front: 'What is a Requirements Traceability Matrix?',
            back: 'A table mapping each requirement to the test cases that cover it, used to prove coverage and to find requirements with no tests at all.',
            bullets: ['Forward: requirement to test', 'Backward: test to requirement', 'Exposes coverage gaps'],
          },
          {
            front: 'What is risk-based testing?',
            back: 'Prioritising test effort by the product risk of each area, where risk is the likelihood of failure multiplied by its business impact.',
            bullets: ['Score likelihood x impact', 'Test highest risk first', 'Justifies what is not tested'],
          },
        ],
        questions: [
          {
            prompt: 'Which document is organisation-wide and relatively static?',
            options: ['Test plan', 'Test strategy', 'Test case', 'Defect report'],
            correctIndex: 1,
            explanation: 'The strategy describes the general approach across projects; the plan is project-specific.',
            difficulty: 'EASY',
          },
          {
            prompt: 'What is the primary purpose of a Requirements Traceability Matrix?',
            options: [
              'To schedule test execution',
              'To prove each requirement has test coverage',
              'To track defect severity',
              'To estimate automation effort',
            ],
            correctIndex: 1,
            explanation: 'An RTM maps requirements to test cases in both directions, exposing untested requirements.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'In risk-based testing, product risk is calculated as:',
            options: [
              'Severity x priority',
              'Likelihood of failure x business impact',
              'Defect count / test count',
              'Effort / available time',
            ],
            correctIndex: 1,
            explanation: 'Risk combines how likely a failure is with how much it would hurt the business.',
            difficulty: 'MEDIUM',
          },
        ],
      },
      {
        name: 'Defect Management',
        description: 'Severity, priority, the bug lifecycle and writing reports developers act on.',
        cards: [
          {
            front: 'Severity vs Priority',
            back: 'Severity measures the technical impact of the defect on the system. Priority measures how urgently the business wants it fixed. They are set by different people and can diverge.',
            bullets: [
              'High severity, low priority: crash in a feature nobody uses yet',
              'Low severity, high priority: typo in the company logo',
            ],
          },
          {
            front: 'What is the defect lifecycle?',
            back: 'The states a defect moves through from discovery to closure, with a clear owner at each step.',
            bullets: [
              'New -> Assigned -> Open',
              'Fixed -> Retest -> Verified -> Closed',
              'Or: Rejected / Duplicate / Deferred',
              'Reopened when the retest fails',
            ],
          },
          {
            front: 'What belongs in a good defect report?',
            back: 'Enough detail for a developer to reproduce the problem without asking a single follow-up question.',
            bullets: [
              'Clear, specific summary',
              'Environment and build number',
              'Numbered reproduction steps',
              'Expected vs actual result',
              'Evidence: logs, screenshots, video',
              'Severity and priority',
            ],
          },
          {
            front: 'What is defect leakage?',
            back: 'Defects that escape a test phase and are found later, typically in production. Measured as defects found after release divided by total defects.',
            bullets: ['Signals gaps in test coverage', 'Drives retrospectives and new regression tests'],
          },
          {
            front: 'What is Root Cause Analysis?',
            back: 'A structured investigation into why a defect was introduced and why it was not caught, so the process can be corrected rather than just the code.',
            bullets: ['5 Whys', 'Fishbone / Ishikawa diagram', 'Outcome: a process change, not just a fix'],
          },
        ],
        questions: [
          {
            prompt: 'A rare crash occurs in an admin screen used once a year. Most likely classification?',
            options: [
              'High severity, low priority',
              'Low severity, high priority',
              'High severity, high priority',
              'Low severity, low priority',
            ],
            correctIndex: 0,
            explanation: 'A crash is technically severe, but low usage means the business can wait for the fix.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'A defect fails its retest. Which state does it move to?',
            options: ['Closed', 'Deferred', 'Reopened', 'Duplicate'],
            correctIndex: 2,
            explanation: 'A failed retest sends the defect back to the developer as Reopened.',
            difficulty: 'EASY',
          },
          {
            prompt: 'Defect leakage measures:',
            options: [
              'Defects rejected as invalid',
              'Defects found after a phase ends, usually in production',
              'Defects per developer',
              'Time to fix a defect',
            ],
            correctIndex: 1,
            explanation: 'Leakage counts the defects that escaped testing and reached a later phase.',
            difficulty: 'MEDIUM',
          },
        ],
      },
    ],
  },
  {
    name: 'Agile QA Process',
    slug: 'agile-qa-process',
    track: 'PROCESS',
    description: 'How the QA role works inside Scrum, and what the team expects from you.',
    icon: '🔄',
    accent: '#059669',
    subSections: [
      {
        name: 'Scrum Ceremonies & the QA Role',
        description: 'Where QA adds value in each Scrum event.',
        cards: [
          {
            front: 'What does QA contribute at backlog refinement?',
            back: 'QA challenges the story before it is estimated - surfacing ambiguity, missing acceptance criteria and edge cases while changing them is still cheap.',
            bullets: ['Question assumptions', 'Propose acceptance criteria', 'Flag testability problems'],
          },
          {
            front: 'What is the Definition of Done?',
            back: 'A shared checklist every story must satisfy before it counts as complete. It is agreed by the whole team and applies to every item.',
            bullets: [
              'Code reviewed and merged',
              'Unit and integration tests pass',
              'Acceptance criteria verified',
              'No open critical defects',
              'Documentation updated',
            ],
          },
          {
            front: 'Definition of Done vs Acceptance Criteria',
            back: 'DoD is generic and applies to every story. Acceptance criteria are specific to one story and describe the behaviour that story must deliver.',
            bullets: ['DoD: team-wide, constant', 'AC: per story, unique'],
          },
          {
            front: 'What is the Agile Testing Quadrants model?',
            back: 'A model classifying tests by whether they guide development or critique the product, and whether they are business or technology facing.',
            bullets: [
              'Q1 Technology-facing, guides dev: unit, component',
              'Q2 Business-facing, guides dev: functional, story tests',
              'Q3 Business-facing, critiques product: exploratory, UAT',
              'Q4 Technology-facing, critiques product: performance, security',
            ],
          },
          {
            front: 'What is the test automation pyramid?',
            back: 'A guide to test distribution: many fast unit tests at the base, fewer integration tests, and a small number of slow end-to-end tests at the top.',
            bullets: [
              'Unit: fast, cheap, isolate logic',
              'Integration / API: verify contracts',
              'E2E: few, cover critical journeys only',
              'Inverted pyramid = slow, flaky suite',
            ],
          },
          {
            front: 'What is Behaviour Driven Development?',
            back: 'A collaboration practice where business, development and QA agree on behaviour in a shared Given/When/Then syntax before any code is written.',
            bullets: ['Given: precondition', 'When: action', 'Then: expected outcome', 'Three Amigos conversation'],
          },
        ],
        questions: [
          {
            prompt: 'Which applies to every story rather than just one?',
            options: ['Acceptance criteria', 'Definition of Done', 'Test case', 'User story'],
            correctIndex: 1,
            explanation: 'The DoD is a team-wide checklist; acceptance criteria are story-specific.',
            difficulty: 'EASY',
          },
          {
            prompt: 'The test automation pyramid recommends:',
            options: [
              'Mostly end-to-end tests',
              'Equal numbers at every level',
              'Mostly unit tests, few end-to-end tests',
              'Only API tests',
            ],
            correctIndex: 2,
            explanation: 'A wide base of fast unit tests with a narrow tip of E2E tests keeps the suite fast and stable.',
            difficulty: 'EASY',
          },
          {
            prompt: 'Exploratory testing and UAT belong to which Agile Testing Quadrant?',
            options: ['Q1', 'Q2', 'Q3', 'Q4'],
            correctIndex: 2,
            explanation: 'Q3 is business-facing and critiques the product.',
            difficulty: 'HARD',
          },
        ],
      },
    ],
  },

  /* =============================== TECHNICAL =============================== */
  {
    name: 'Test Design Techniques',
    slug: 'test-design-techniques',
    track: 'TECHNICAL',
    description: 'Deriving the smallest set of tests that still finds the defects.',
    icon: '🎯',
    accent: '#dc2626',
    subSections: [
      {
        name: 'Black-Box Techniques',
        description: 'Equivalence partitioning, boundary values, decision tables and state transitions.',
        cards: [
          {
            front: 'What is equivalence partitioning?',
            back: 'Dividing input data into groups expected to be handled identically, then testing one representative value per group. It cuts test count without losing coverage.',
            bullets: ['Valid and invalid partitions', 'One value per partition', 'Combine with boundary analysis'],
          },
          {
            front: 'What is boundary value analysis?',
            back: 'Testing at the edges of each equivalence partition, because off-by-one errors cluster there.',
            bullets: [
              'For a 1-100 field test 0, 1, 2, 99, 100, 101',
              'Two-value: just inside and just outside',
              'Three-value: below, on, above',
            ],
          },
          {
            front: 'When do you use a decision table?',
            back: 'When the expected outcome depends on a combination of conditions. Each column is a rule pairing a condition combination with its expected action.',
            bullets: ['Rows: conditions and actions', 'Columns: rules', 'N booleans give 2^N rules'],
          },
          {
            front: 'What is state transition testing?',
            back: 'Modelling the system as states and the events that move between them, then testing valid transitions and, importantly, the invalid ones.',
            bullets: ['States, events, guards, actions', 'Cover every valid transition', 'Probe invalid transitions'],
          },
          {
            front: 'What is pairwise (all-pairs) testing?',
            back: 'An optimisation that covers every pair of parameter values at least once, on the basis that most defects come from a single parameter or an interaction between two.',
            bullets: ['Massive reduction vs exhaustive', 'Tools: PICT, AllPairs'],
          },
          {
            front: 'What is error guessing?',
            back: 'An experience-based technique where the tester deliberately targets inputs likely to break the system, based on past defects and intuition.',
            bullets: ['Empty and null input', 'Zero and negative numbers', 'Very long strings', 'Special characters'],
          },
        ],
        questions: [
          {
            prompt: 'A field accepts 18-65. Which set best reflects boundary value analysis?',
            options: ['18, 40, 65', '17, 18, 65, 66', '1, 50, 100', '18, 65 only'],
            correctIndex: 1,
            explanation: 'Boundary analysis tests just inside and just outside each edge.',
            difficulty: 'EASY',
          },
          {
            prompt: 'Which technique suits business rules with several interacting conditions?',
            options: ['Boundary value analysis', 'Decision table testing', 'Statement coverage', 'Error guessing'],
            correctIndex: 1,
            explanation: 'Decision tables enumerate combinations of conditions and their expected actions.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'A login screen has 4 boolean settings. How many rules does a full decision table have?',
            options: ['4', '8', '16', '24'],
            correctIndex: 2,
            explanation: '2^4 = 16 combinations.',
            difficulty: 'HARD',
          },
          {
            prompt: 'Pairwise testing is based on the observation that most defects are caused by:',
            options: [
              'Three or more interacting parameters',
              'One parameter or an interaction of two',
              'Boundary values only',
              'Invalid input only',
            ],
            correctIndex: 1,
            explanation: 'All-pairs covers every pair of values, catching the majority of interaction defects.',
            difficulty: 'HARD',
          },
        ],
      },
      {
        name: 'White-Box Techniques',
        description: 'Coverage criteria and what each one actually guarantees.',
        cards: [
          {
            front: 'Statement vs branch coverage',
            back: 'Statement coverage requires every line to execute. Branch coverage requires every decision to take both outcomes, and is strictly stronger.',
            bullets: ['100% branch implies 100% statement', 'The reverse is not true'],
          },
          {
            front: 'Why is 100% statement coverage insufficient?',
            back: 'An `if` without an `else` reaches 100% statement coverage from a single passing test, while the false path is never exercised at all.',
            bullets: ['Hidden else paths go untested', 'Prefer branch or condition coverage'],
          },
          {
            front: 'What is cyclomatic complexity?',
            back: 'A count of the linearly independent paths through a function, computed as E - N + 2P. It gives a lower bound on the tests needed for path coverage.',
            bullets: ['Higher value means harder to test', 'Above 10 is usually a refactoring signal'],
          },
          {
            front: 'What is MC/DC coverage?',
            back: 'Modified Condition/Decision Coverage requires each individual condition in a compound decision to be shown to independently affect the outcome. Mandated in safety-critical standards such as DO-178C.',
            bullets: ['Stronger than branch coverage', 'Avionics, medical, automotive'],
          },
        ],
        questions: [
          {
            prompt: 'Which coverage criterion is strongest?',
            options: ['Statement coverage', 'Branch coverage', 'MC/DC', 'Line coverage'],
            correctIndex: 2,
            explanation: 'MC/DC requires each condition to independently affect the decision outcome.',
            difficulty: 'HARD',
          },
          {
            prompt: 'Achieving 100% statement coverage guarantees 100% branch coverage.',
            options: ['True', 'False'],
            correctIndex: 1,
            explanation: 'An if without an else can reach full statement coverage while the false branch never runs.',
            difficulty: 'MEDIUM',
          },
        ],
      },
    ],
  },
  {
    name: 'Test Automation',
    slug: 'test-automation',
    track: 'TECHNICAL',
    description: 'Frameworks, patterns and the discipline that keeps a suite trustworthy.',
    icon: '🤖',
    accent: '#ea580c',
    subSections: [
      {
        name: 'Automation Fundamentals',
        description: 'What to automate, what not to, and how to keep tests stable.',
        cards: [
          {
            front: 'Which tests are worth automating?',
            back: 'Automate what is repetitive, objective and stable. Leave what needs human judgement to exploratory testing.',
            bullets: [
              'Automate: regression, smoke, data-driven, API',
              'Do not automate: one-off checks, usability, unstable features',
            ],
          },
          {
            front: 'What is the Page Object Model?',
            back: 'A design pattern that wraps each page or component in a class exposing intent-revealing methods, so a UI change is fixed in one file rather than across every test.',
            bullets: ['Locators live in the page object', 'Tests read as user intent', 'No assertions inside page objects'],
          },
          {
            front: 'What causes flaky tests?',
            back: 'Tests that pass and fail without a code change. The usual causes are timing, shared state and environment noise.',
            bullets: [
              'Hard-coded sleeps instead of waits',
              'Test interdependence and shared data',
              'Unstable locators such as generated CSS classes',
              'Animations and network variability',
            ],
          },
          {
            front: 'Implicit vs explicit waits',
            back: 'An implicit wait is a global polling timeout for element lookup. An explicit wait blocks until a specific condition is true. Explicit waits are preferred, and mixing the two causes unpredictable timeouts.',
            bullets: ['Explicit: wait for the condition you actually need', 'Never mix implicit and explicit'],
          },
          {
            front: 'What makes a good locator strategy?',
            back: 'Prefer locators tied to purpose over ones tied to presentation, because styling changes far more often than behaviour.',
            bullets: [
              'Best: dedicated test IDs, roles, accessible names',
              'Acceptable: stable IDs',
              'Avoid: absolute XPath, generated class names',
            ],
          },
          {
            front: 'What is data-driven testing?',
            back: 'Separating test logic from test data so the same scenario runs across many input sets, usually from a table, CSV or fixture file.',
            bullets: ['One scenario, many datasets', 'Easier to extend coverage', 'Keeps assertions in one place'],
          },
        ],
        questions: [
          {
            prompt: 'Which is the strongest sign a test is flaky rather than genuinely failing?',
            options: [
              'It fails on every run',
              'It passes and fails intermittently with no code change',
              'It takes a long time to run',
              'It has many assertions',
            ],
            correctIndex: 1,
            explanation: 'Non-deterministic results with an unchanged codebase are the definition of flakiness.',
            difficulty: 'EASY',
          },
          {
            prompt: 'The main benefit of the Page Object Model is:',
            options: [
              'Faster test execution',
              'A UI change is fixed in one place',
              'It removes the need for waits',
              'It generates test data',
            ],
            correctIndex: 1,
            explanation: 'Centralising locators keeps maintenance cost low as the UI evolves.',
            difficulty: 'EASY',
          },
          {
            prompt: 'Which locator is most resilient to styling changes?',
            options: [
              'Absolute XPath',
              'Generated CSS class name',
              'A dedicated data-testid attribute',
              'Element index position',
            ],
            correctIndex: 2,
            explanation: 'A test ID is owned by the test and does not move when styling changes.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'Why should implicit and explicit waits not be mixed?',
            options: [
              'It is slower to write',
              'Timeouts compound unpredictably',
              'Explicit waits stop working entirely',
              'It breaks the Page Object Model',
            ],
            correctIndex: 1,
            explanation: 'Combining the two produces timeouts that are hard to predict or debug.',
            difficulty: 'HARD',
          },
        ],
      },
    ],
  },
  {
    name: 'API & Performance Testing',
    slug: 'api-performance-testing',
    track: 'TECHNICAL',
    description: 'Testing below the UI, where the tests are fast and the contracts live.',
    icon: '🔌',
    accent: '#2563eb',
    subSections: [
      {
        name: 'REST API Testing',
        description: 'Methods, status codes, idempotency and what to assert.',
        cards: [
          {
            front: 'Which HTTP methods are idempotent?',
            back: 'GET, PUT, DELETE, HEAD and OPTIONS are idempotent - repeating the request leaves the server in the same state. POST and PATCH are not.',
            bullets: ['GET: safe and idempotent', 'PUT: replaces, idempotent', 'POST: creates, not idempotent'],
          },
          {
            front: 'PUT vs PATCH vs POST',
            back: 'POST creates a new resource. PUT replaces a resource in full. PATCH applies a partial modification.',
            bullets: ['POST /cards -> 201 Created', 'PUT /cards/:id -> full replace', 'PATCH /cards/:id -> partial'],
          },
          {
            front: 'What do the main HTTP status code families mean?',
            back: 'The first digit classifies the outcome, which is the first thing to assert in an API test.',
            bullets: [
              '2xx Success: 200 OK, 201 Created, 204 No Content',
              '4xx Client error: 400, 401, 403, 404, 409, 422',
              '5xx Server error: 500, 502, 503',
            ],
          },
          {
            front: '401 vs 403',
            back: '401 Unauthorized means the request lacks valid credentials - authentication failed. 403 Forbidden means the caller is authenticated but not permitted to perform this action.',
            bullets: ['401: who are you?', '403: I know who you are, and no'],
          },
          {
            front: 'What should an API test assert?',
            back: 'Far more than the status code - the contract, the payload and the behaviour under error conditions.',
            bullets: [
              'Status code',
              'Response schema and data types',
              'Business correctness of values',
              'Headers and content type',
              'Response time',
              'Error shape on invalid input',
            ],
          },
          {
            front: 'What is contract testing?',
            back: 'Verifying that a consumer and provider agree on the shape of their interaction, without running both systems together in one environment.',
            bullets: ['Consumer-driven contracts', 'Tools: Pact, Spring Cloud Contract', 'Catches breaking changes in CI'],
          },
        ],
        questions: [
          {
            prompt: 'Which method is NOT idempotent?',
            options: ['GET', 'PUT', 'POST', 'DELETE'],
            correctIndex: 2,
            explanation: 'Repeating a POST typically creates another resource.',
            difficulty: 'EASY',
          },
          {
            prompt: 'A DELETE succeeds and returns no body. The correct status code is:',
            options: ['200 OK', '201 Created', '204 No Content', '404 Not Found'],
            correctIndex: 2,
            explanation: '204 signals success with no response body.',
            difficulty: 'EASY',
          },
          {
            prompt: 'A user is logged in but lacks permission for an action. Expected status?',
            options: ['400', '401', '403', '404'],
            correctIndex: 2,
            explanation: '403 Forbidden: authenticated but not authorised.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'Which best describes contract testing?',
            options: [
              'Load testing an API endpoint',
              'Verifying consumer and provider agree on the interaction shape',
              'Testing the UI against the API',
              'Checking API response times',
            ],
            correctIndex: 1,
            explanation: 'Contract tests catch breaking interface changes without full integration environments.',
            difficulty: 'HARD',
          },
        ],
      },
      {
        name: 'Performance Testing Basics',
        description: 'Load, stress, soak and spike - and the metrics that matter.',
        cards: [
          {
            front: 'Load vs stress vs soak vs spike testing',
            back: 'Four performance test types, each answering a different question about how the system behaves under pressure.',
            bullets: [
              'Load: expected volume - does it meet SLAs?',
              'Stress: beyond capacity - where does it break?',
              'Soak: normal load, long duration - are there leaks?',
              'Spike: sudden surge - does it recover?',
            ],
          },
          {
            front: 'Why report percentiles instead of averages?',
            back: 'An average hides the slow tail. A 200 ms mean can still mean 5% of users wait four seconds, which is what they will complain about.',
            bullets: ['Report p50, p90, p95, p99', 'SLAs are written against percentiles'],
          },
          {
            front: 'Throughput vs response time',
            back: 'Throughput is how many requests the system completes per unit of time. Response time is how long one request takes. Throughput can stay flat while response time climbs - the sign of a saturated system.',
            bullets: ['Throughput: requests/sec', 'Response time: latency per request'],
          },
          {
            front: 'What is a performance bottleneck?',
            back: 'The single resource that limits overall throughput. Removing it shifts the limit somewhere else, so performance tuning is always iterative.',
            bullets: ['CPU, memory, disk I/O, network', 'Database locks and slow queries', 'Connection pool exhaustion'],
          },
        ],
        questions: [
          {
            prompt: 'Which test type is designed to reveal memory leaks?',
            options: ['Spike testing', 'Stress testing', 'Soak testing', 'Load testing'],
            correctIndex: 2,
            explanation: 'Soak testing runs a normal load for an extended period, surfacing gradual resource leaks.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'Why is p95 response time more useful than the mean?',
            options: [
              'It is easier to calculate',
              'It reveals the slow tail that averages hide',
              'It is always lower',
              'It measures throughput',
            ],
            correctIndex: 1,
            explanation: 'Percentiles expose the worst experiences that an average smooths away.',
            difficulty: 'MEDIUM',
          },
          {
            prompt: 'Throughput plateaus while response time keeps rising. This indicates:',
            options: ['A healthy system', 'System saturation', 'A network outage', 'A test script error'],
            correctIndex: 1,
            explanation: 'Requests are queuing behind a saturated resource.',
            difficulty: 'HARD',
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log('Seeding QA Assessment curriculum...');

  // Ensure a default player exists so the first request has progress to attach to.
  const playerCount = await prisma.player.count();
  if (playerCount === 0) {
    await prisma.player.create({ data: { name: 'QA Trainee' } });
    console.log('  created default player');
  }

  for (const [sectionIndex, seed] of CURRICULUM.entries()) {
    // Replacing by slug keeps re-runs idempotent without orphaning progress rows
    // for sections that are not part of the seed.
    const existing = await prisma.section.findUnique({ where: { slug: seed.slug }, select: { id: true } });
    if (existing) {
      await prisma.section.delete({ where: { id: existing.id } });
    }

    const section = await prisma.section.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        track: seed.track,
        description: seed.description,
        icon: seed.icon,
        accent: seed.accent,
        order: sectionIndex,
      },
    });

    for (const [subIndex, seedSub] of seed.subSections.entries()) {
      const sub = await prisma.subSection.create({
        data: {
          sectionId: section.id,
          name: seedSub.name,
          description: seedSub.description,
          order: subIndex,
        },
      });

      await prisma.card.createMany({
        data: seedSub.cards.map((card, cardIndex) => ({
          subSectionId: sub.id,
          front: card.front,
          back: card.back,
          bullets: JSON.stringify(card.bullets ?? []),
          order: cardIndex,
        })),
      });

      if (seedSub.questions?.length) {
        await prisma.quizQuestion.createMany({
          data: seedSub.questions.map((q) => ({
            subSectionId: sub.id,
            prompt: q.prompt,
            options: JSON.stringify(q.options),
            correctIndex: q.correctIndex,
            explanation: q.explanation,
            difficulty: q.difficulty,
          })),
        });
      }
    }

    const cards = seed.subSections.reduce((n, s) => n + s.cards.length, 0);
    const questions = seed.subSections.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
    console.log(`  ${seed.icon} ${seed.name}: ${seed.subSections.length} decks, ${cards} cards, ${questions} questions`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
