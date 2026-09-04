# OpenCode Orchestrator Kit - Context Collection

## 1. Agents Roster & Model/Mode Analysis

### Core Agents (agents/)

#### Primary Mode (2 agents):
1. **orchestrator.md** - mode: primary, model: opencode-go/gpt-5.6-luna
   - Role: Central coordination agent, breaks work into steps, assigns to specialists, manages parallel/sequential execution
   - Read/write scope: Limited to `.context/progress.md`, `.context/decisions.md`, `.context/issues.md`, `plan/**/*.md`
   - Tools: webfetch, write, edit

2. **security.md** - mode: primary, model: opencode-go/kimi-k3
   - Role: Security engineer focused on vulnerability detection, threat modeling, secure coding practices
   - Read/write scope: Read-only (deny all except specific tools)
   - Tools: code-review-graph MCP tools, read-only tools

#### Subagent Mode (11 agents):
3. **profiler.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
   - Role: Repo bootstrap specialist, detects tech stack, CI/CD, scaffolds project
   - Read/write scope: Limited to specific files only (.opencode/PROJECT-PROFILE.md, .context/*.md, plan/README.md, plan/*/.gitkeep)

4. **explorer.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
   - Role: Fast codebase explorer, finds files, traces symbols, answers structure questions
   - Read/write scope: Read-only
   - Tools: code-review-graph MCP tools, read-only tools

5. **librarian.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
   - Role: Research-focused agent, explains code across repos, cites official docs
   - Read/write scope: Read-only

6. **oracle.md** - mode: subagent, model: opencode-go/kimi-k3
   - Role: Read-only technical advisor, gives architecture/design recommendations
   - Read/write scope: Read-only

7. **planner.md** - mode: subagent, model: ollama/glm-5.2:cloud
   - Role: High-reasoning planning agent, creates phased development plans
   - Read/write scope: Writes to plan/draft/*.md and plan/in-progress/*.md only

8. **developer-fixer.md** - mode: subagent, model: opencode-go/minimax-m3
   - Role: Unified implementation agent, operates in Fixer mode (exact spec) or Developer mode (TDD)
   - Read/write scope: Writes application code/tests, edits files

9. **test-engineer.md** - mode: subagent, model: opencode-go/minimax-m3
   - Role: QA engineer, designs test strategy, writes behavior-level tests, analyzes coverage
   - Read/write scope: Writes test files only (ask permission for test-related edits)

10. **code-reviewer.md** - mode: subagent, model: opencode-go/minimax-m3
    - Role: Systematic code reviewer, finds bugs/security flaws, ranks them, recommends fixes
    - Read/write scope: Read-only
    - Tools: code-review-graph MCP tools

11. **build-helper.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
    - Role: Build-tool error specialist, diagnoses TypeScript/Vite/webpack errors
    - Read/write scope: Edits config files only (tsconfig.json, vite.config.*, etc.)

12. **npm-helper.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
    - Role: npm/Node error specialist, diagnoses install/runtime/peer-dep issues
    - Read/write scope: Edits package.json, package-lock.json, .npmrc, *.md

13. **deploy-helper.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
    - Role: CI/CD and deployment specialist, diagnoses GitHub Actions/Vercel/Netlify failures
    - Read/write scope: Edits .github/workflows/*.yml, vercel.json, netlify.toml, package.json, *.md

### Extra Agents (extras/)

14. **writer.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
    - Role: Technical writer, produces clear documentation for READMEs, APIs, architecture
    - Read/write scope: Writes documentation only, no executable code

15. **pc-doctor.md** - mode: subagent, model: ollama/deepseek-v4-flash:cloud
    - Role: Windows PC troubleshooter, fixes environment variables, PATH, services, registry
    - Read/write scope: Edits files only (ask permission for changes)

### Mode Conflicts Analysis:
- **Found**: 2 primary agents (`orchestrator.md` and `security.md`) - this is noted as a known discrepancy in AGENTS.md
- **Expected**: Typically 1 primary orchestrator per spec, but this two-primary situation is explicitly called out as out-of-scope

### Model Distribution:
- **opencode-go/gpt-5.6-luna**: 1 (orchestrator - most expensive)
- **opencode-go/kimi-k3**: 2 (security, oracle)
- **opencode-go/minimax-m3**: 3 (developer-fixer, test-engineer, code-reviewer)
- **ollama/deepseek-v4-flash:cloud**: 4 (profiler, explorer, librarian, npm-helper)
- **ollama/glm-5.2:cloud**: 1 (planner)

## 2. Installer / Setup Mechanisms

### Current Setup:
1. **install.sh** - Main installer script
   - Modes: project, global, studio
   - Flags: --symlink, --with-extras, --with-examples
   - Copies/symlinks: AGENTS.md, CONTRIBUTING.md, agents/, skills/, extras/ (optional), command/

2. **Installation Targets**:
   - **project**: Into `./.opencode/` + `./AGENTS.md`, `./CONTRIBUTING.md`
   - **global**: Into `~/.config/opencode/` (all projects)
   - **studio**: Into `~/.config/opencode-profiles/<profile>/`

3. **Command System**:
   - start-session.md - First command for bootstrapping
   - Loads orchestrator agent automatically

4. **Bootstrap Sequence**:
   - Check for `.opencode/PROJECT-PROFILE.md` - if missing, delegate to `profiler`
   - Load `.context/progress.md`, `.context/decisions.md`, `.context/issues.md`
   - Provide 3-4 line Italian summary of stack, status, latest issue/decision
   - Wait for next instruction (no auto-start of new work)

### Manual Install Path:
- Copy/symlink these 5 items to target location:
  1. AGENTS.md
  2. CONTRIBUTING.md
  3. agents/
  4. skills/
  5. command/

### Configuration Precedence:
- Project-level `.opencode/` files take precedence over global `~/.config/opencode/`
- Studio profiles have precedence issue noted in known issue

## 3. Skills Breakdown

### Universal Skills (always installed):
1. **github-actions-cicd** - GitHub Actions workflow structure and security conventions
2. **npm-debug** - npm/Node error decision trees (used by multiple agents)
3. **dev-cleanup** - Safe cleanup of caches and dev artifacts (used by multiple agents)
4. **build-debug** - Build-tool error decision trees (used by build-helper)

### Stack-Specific Skills (examples/):
1. **python-conventions** - Python style and structure based on PEP 8
   - Naming: lower_case_with_underscores, CapitalizedWords, UPPERCASE_WITH_UNDERSCORES
   - Formatting: 4 spaces, 79-char lines, specific import ordering
   - Used by: Any agent implementing Python features

2. **dotnet-conventions** - C#/.NET naming and conventions
   - Naming: PascalCase, camelCase, I-prefix for interfaces, _ prefix for private fields
   - Style: var usage, modern C# features, dependency injection preferred
   - Used by: Any agent implementing .NET features

3. **angular-patterns** - Angular structure and component conventions
   - Components: Standalone by default, one component per file trio
   - Naming: kebab-case for files, PascalCase for classes
   - State management: Signals or RxJS consistently within module
   - Used by: Any agent implementing Angular features

### Skill Loading Pattern:
- Agents explicitly load skills before using them (e.g., `skill({ name: "github-actions-cicd" })`)
- Skills provide decision trees for deterministic fixes
- Skills are organized by technology stack in examples/ subdirectory

## 4. Test Suite Analysis

### Test Files Overview:
1. **agent-schema.test.ts** - Tests agent frontmatter schema validation
2. **assemble-prompt.test.ts** - Tests prompt assembly order and boundary compliance
3. **assembly-order.test.ts** - Tests deterministic file enumeration order
4. **cache.test.ts** - Tests prompt caching behavior
5. **fixtures/** - Test data directory with prompt-prefix-boundary.txt
6. **frontmatter-order.test.ts** - Tests canonical frontmatter key order
7. **model-preset.test.ts** - Tests model preset resolution and consistency
8. **prepare-pages.test.ts** - Tests site page preparation
9. **routing-consistency.test.ts** - Tests routing disambiguation rules
10. **skill-schema.test.ts** - Tests skill frontmatter schema
11. **stable-prefix-boundary.test.ts** - Tests boundary file compliance

### Coverage Gaps:
- **No application code tests**: Tests/ contains only kit-internal tests, no tests for actual application functionality
- **No integration tests**: No tests for end-to-end workflows or agent interactions
- **No performance tests**: No tests for build times, token usage, or scalability
- **No security tests**: No vulnerability scanning or security testing
- **No smoke tests**: No basic functionality tests for the orchestrator itself

### Test Purpose:
- **Schema validation**: Ensures agent/skill frontmatter follows required structure
- **Boundary compliance**: Ensures stable prefix contract is maintained
- **Order consistency**: Ensures deterministic file enumeration
- **Routing validation**: Ensures routing disambiguation rules work correctly
- **Prompt assembly**: Ensures prompt assembly follows contract

## 5. Documentation & Site Structure

### Documentation Files:
1. **README.md** - Main documentation (7,420 lines)
   - Clear kit overview and purpose
   - Detailed usage instructions
   - Agent roster and roles
   - Quickstart guides (native and Studio)
   - Customization options

2. **docs/SETUP-OPENCODE-STUDIO.md** - Optional OpenCode Studio setup guide (35 lines)
3. **docs/SETUP-NATIVE.md** - Native OpenCode setup guide (61 lines)
4. **docs/ARCHITECTURE.md** - Architecture documentation (68 lines)

### Site Structure:
- **site/** - Generated static site (not tracked in git)
- **src/** - Source for site generation
  - **components/** - UI components
    - **landing/** - Landing page components
  - **styles.css** - Component styles

### Key Documentation Sections:
- **Installation**: Project-only vs global vs Studio profiles
- **Quickstart**: Step-by-step setup instructions
- **Architecture**: Routing flow and human-in-the-loop confirmation
- **Customizing**: Model swapping and skill addition

## 6. Model Config / Profile Structure

### .opencode/PROJECT-PROFILE.md:
Current profile shows:
```
# Stack
- Language: TypeScript
- Framework: React
- Package Manager: Bun
- Build Tool: Vite
- Test Framework: None detected
- CI/CD: None detected

# Structure
- Monorepo: No
- Detected Manifests:
  - package.json

# Code Graph
- Code Graph: absent — optional, see CRG integration notes
```

### Model Assignment:
- Each agent has explicit model assignment in frontmatter
- Model choice is editable per deployment without touching orchestration contract
- Two-tier model strategy: cheap models for exploration, stronger models for implementation/review

### Code Graph (CRG) Integration:
- Optional `code-review-graph` MCP server support
- Used by: explorer, security, code-reviewer for blast radius analysis
- Must work identically whether present or absent
- Fallback to standard `read`/`glob`/`grep` if unavailable

## Summary

### Core Strengths:
1. **Clear delegation model**: 15 specialized agents with distinct responsibilities
2. **Self-bootstrapping**: Works on any repo, known or unknown
3. **Model efficiency**: Matches model complexity to task requirements
4. **Context management**: Session memory auto-archived to prevent unbounded growth
5. **Documentation**: Comprehensive README and setup guides

### Areas for Enhancement:
1. **Test coverage**: No application code or integration tests
2. **Known issues**: Two primary agents (orchestrator + security)
3. **Setup complexity**: Manual steps required for installation
4. **No built-in CI/CD**: All CI/CD configuration is user-managed

### File Structure Summary:
- **48 files in agents/**: 15 agent definitions (14 core + 2 extras, 1 duplicate read)
- **4 skills files**: 1 universal, 3 stack-specific
- **11 test files**: All kit-internal, no application tests
- **5 docs files**: Setup, architecture, main README
- **1 install.sh**: Installer script
- **1 start-session.md**: Command definition

The kit is a lean, adoption-ready orchestrator framework with clear boundaries, but lacks testing infrastructure for actual application functionality.