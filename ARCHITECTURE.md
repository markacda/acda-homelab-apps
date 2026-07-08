# Architecture

Every app in this repo follows a **Domain-Driven-Design / Clean-Architecture** layout —
the layered Ports/Adapters/Domain/Application shape common on .NET projects, adapted
pragmatically to Node/Express/TypeScript. `apps/recipe-book` is the **reference
implementation**; copy it when building a new app. Each app creates only the layers it
needs — the built-in apps span the range:

- **recipe-book** — the fuller reference: aggregates + repositories, external Allerhande +
  Tectonic ports, image store.
- **dynamic-vs-fixed** — a stateless calculation pipeline: no aggregate/repository, but
  external Homewizard-parser and EnergyZero ports.
- **log-viewer** — a read-only analytics app: a `LogStore` port + `FileLogStore` adapter, a
  background ingest service, and a query/read model over the in-memory view.
- **dashboard** — Docker-socket discovery + config + HTTP health-probe ports, with a gated
  background health-monitor holding the status cache.
- **atc** — a thin proxy: a validated `PointQuery` value object + one external
  `AirplanesSource` adapter, with a vendored `Web/public` and no client build.
- **ev-crossover** — a static page with no server-side domain at all: just `Web/` (the
  browser-side `crossover.ts` formula + UI) and a bare composition-root `server.ts`.

## Node/Express adaptations (read first)

The template comes from a DI-container, message-bus world; this repo has neither, so:

- **No DI container.** Wiring is manual, in `Application/Registrations/register.ts`: build
  the adapters, inject them into the application services, construct the controllers, and
  mount their routers on the Express app. `server.ts` calls `createApp()` → `register(app)`
  → `startServer()`.
- **No event/message bus.** `Domain/Events`, `Application/Handlers/DomainEventHandlers`
  and `Application/Handlers/IntegrationEventHandlers` are part of the canonical structure
  but are **omitted** until an app actually has an event bus.
- **`erasableSyntaxOnly`** (from `tsconfig.base.json`): Node runs `.ts` directly via native
  type-stripping, so **no enums, namespaces, or parameter-properties**. Aggregates are
  plain classes with explicit field declarations and assignment in the constructor body
  (not `constructor(private x)`).
- **Errors as control flow.** Domain code throws `DomainError` subclasses that carry an
  HTTP status; a single `Application/Filters` error middleware maps them to
  `status { error }`, and anything unexpected falls through to server-kit's 500 handler.
  Express 5 forwards async rejections to error middleware automatically, so controllers use
  plain `async` handlers and just `throw`.

## Canonical structure

Create only the folders an app needs (**omit unused ones** — don't scaffold empty
directories), but keep every new folder faithful to this layout so the apps stay
consistent.

```
apps/<app>/                       # kebab-case app dir
  server.ts                       # composition root: createApp -> register -> startServer
  Domain/                         # the business model — depends on nothing outside Domain
    Aggregates/                   # entities + invariants (classes: create/fromJSON/toJSON + behavior)
    Events/                       # domain events (omit unless an event bus exists)
    Exceptions/                   # DomainError + typed subclasses (ValidationError, NotFoundError, ...)
    Ports/
      Repositories/               # persistence port interfaces owned by the domain
      <other>.ts                  # other domain-owned persistence ports (e.g. image-store)
    Services/Interfaces/          # domain-service contracts (if any)
    ValueObjects/
      Identifiers/                # id wrappers (optional)
  Application/                    # use cases — orchestrates Domain + Ports; no I/O of its own
    Controllers/                  # thin Express routers, grouped by resource
    Filters/                      # cross-cutting middleware (e.g. domain-error -> HTTP)
    Handlers/
      DomainEventHandlers/        # (omit unless events exist)
      IntegrationEventHandlers/   # (omit unless events exist)
    Mappers/                      # request/response Models <-> Domain
    Queries/Interfaces/           # read-side contracts (optional; reads may live in repositories)
    Registrations/                # MANUAL wiring (the DI-container stand-in)
    Services/
      Background/                 # long-running/scheduled services (omit if none)
      Interfaces/                 # application-service contracts (optional)
  Models/                         # DTOs — the ONLY layer another app may reference
    Commands/  Requests/  Responses/  Types/
  Ports/
    <AdapterX>/                   # interfaces to external APIs / libraries (not persistence)
  Adapters/
    <AdapterX>/                   # implementations of Domain/Ports + Ports/* interfaces
  Web/                            # everything served to the client
    client/                       # browser *.ts sources (compiled by tsconfig.client.json)
    public/                       # index.html, css, and the compiled *.js bundle
  test/                           # node --test unit tests
```

### Two-tier ports

- **`Domain/Ports/…`** — interfaces the _domain owns_ for persistence (repositories, image
  store). The domain is defined in terms of these.
- **`Ports/<AdapterX>/…`** — interfaces to _external systems_ (third-party APIs, libraries,
  engines) that are infrastructure concerns, not domain rules.
- **`Adapters/<AdapterX>/…`** — the concrete implementations of both kinds of port. An
  adapter group is one folder per external system / storage technology.

Dependency rule: `Domain` depends on nothing; `Application` depends on `Domain` (+ `Models`,
`Ports`); `Adapters` implement `Domain`/`Ports` interfaces; `Models` may reference `Domain`
types; `Registrations` is the only place that knows every concrete class.

## Naming conventions

- **Folders**: PascalCase for the layer/adapter folders (`Domain`, `Application`, `Web`,
  `Adapters/JsonFileStore`). App dirs stay kebab-case (`recipe-book`).
- **Files**: kebab-case (`recipe-controller.ts`, `json-recipe-repository.ts`).
- **Classes / interfaces / constructors**: PascalCase (`class Recipe`,
  `interface RecipeRepository`).
- **Variables / functions / properties**: camelCase.

## Shared code

`apps/Common/*` holds the shared libraries (`@homelab/access-log`, `@homelab/server-kit`,
`@homelab/http-utils`), imported by relative `.ts` path (e.g.
`../Common/server-kit/app.ts` from an app root) and compiled into each app's `dist/`. See
`CLAUDE.md` for the build model (each app pins `rootDir: "../.."` so its output stays at
`dist/apps/<name>/server.js`).

## Reference: `apps/recipe-book`

Folders in use: `Domain/{Aggregates,ValueObjects,Exceptions,Ports/Repositories}`,
`Application/{Controllers,Services,Mappers,Filters,Registrations}`, `Ports/{Allerhande,Latex}`,
`Adapters/{JsonFileStore,Allerhande,Tectonic}`, `Models/{Requests,Responses}`, `Web/{client,public}`.
Notable pieces:

- `Domain/Aggregates/recipe.ts`, `book.ts` — the two aggregate roots and their invariants.
- `Domain/Ports/Repositories/*` + `Domain/Ports/image-store.ts` — persistence ports;
  `Adapters/JsonFileStore/*` implements them over JSON files on the data volume.
- `Ports/Allerhande/recipe-source.ts` + `Ports/Latex/document-generator.ts` — external
  ports; `Adapters/Allerhande/*` (fetch + JSON-LD parse) and `Adapters/Tectonic/*` (LaTeX
  render + PDF) implement them.
- `Application/Services/*` — `RecipeService`, `BookService`, `RecipeImportService`,
  `BookGenerationService`.
- `Application/Registrations/register.ts` — the manual wiring; `server.ts` is a 12-line
  composition root.
