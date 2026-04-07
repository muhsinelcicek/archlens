import fs from "node:fs";
import type { ApiEndpoint, DbEntity } from "../models/architecture.js";

/**
 * FrameworkDetector — Regex-based post-processing detector for framework-specific
 * patterns that AST parsers might miss. Adds API endpoints and DB entities by
 * scanning raw file content for known framework idioms.
 *
 * Supported frameworks:
 * - TypeScript: Express, NestJS, Next.js (app router), Fastify, Hono, Koa
 * - Python: FastAPI, Flask, Django, DRF
 * - Java: Spring Boot (@RestController, @RequestMapping)
 * - Go: gin, echo, chi, fiber, gorilla/mux, net/http
 * - Rust: Actix-web, Rocket, Axum, Warp
 * - Swift: Vapor
 *
 * ORM detection:
 * - TypeScript: Prisma, TypeORM, Sequelize
 * - Python: SQLAlchemy, Django ORM
 * - Java: JPA / @Entity
 * - Go: GORM
 * - Rust: Diesel
 */
export class FrameworkDetector {
  private endpoints: ApiEndpoint[] = [];
  private entities: DbEntity[] = [];

  detect(files: string[]): { endpoints: ApiEndpoint[]; entities: DbEntity[] } {
    for (const filePath of files) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, "utf-8");
        if (content.length > 500_000) continue; // skip huge files

        const ext = filePath.split(".").pop() || "";
        switch (ext) {
          case "ts":
          case "tsx":
          case "js":
          case "jsx":
          case "mjs":
          case "prisma":
            this.detectTypeScript(filePath, content);
            break;
          case "py":
            this.detectPython(filePath, content);
            break;
          case "java":
            this.detectJava(filePath, content);
            break;
          case "go":
            this.detectGo(filePath, content);
            break;
          case "rs":
            this.detectRust(filePath, content);
            break;
          case "swift":
            this.detectSwift(filePath, content);
            break;
        }
      } catch { /* skip unreadable */ }
    }

    return { endpoints: this.endpoints, entities: this.entities };
  }

  // ─── TypeScript / JavaScript ─────────────────────────────────

  private detectTypeScript(filePath: string, content: string): void {
    // Express/Koa/Hono: app.get('/path', handler) or router.get(...)
    const expressRegex = /(?:app|router|api|server|fastify|hono)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
    let m: RegExpExecArray | null;
    while ((m = expressRegex.exec(content)) !== null) {
      this.addEndpoint(m[1].toUpperCase(), m[2], filePath, this.lineFromOffset(content, m.index));
    }

    // NestJS decorators: @Get('path'), @Post(), @Controller('prefix')
    const nestControllerMatch = content.match(/@Controller\s*\(\s*["'`]([^"'`]*)["'`]/);
    const nestPrefix = nestControllerMatch ? "/" + nestControllerMatch[1].replace(/^\//, "") : "";

    const nestRegex = /@(Get|Post|Put|Patch|Delete|All)\s*\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
    while ((m = nestRegex.exec(content)) !== null) {
      const subPath = m[2] || "";
      const fullPath = (nestPrefix + (subPath ? "/" + subPath : "")).replace(/\/+/g, "/") || "/";
      this.addEndpoint(m[1].toUpperCase(), fullPath, filePath, this.lineFromOffset(content, m.index));
    }

    // Next.js App Router: file path = route. e.g., app/api/users/route.ts
    if (/\/app\/api\//.test(filePath) && /route\.(ts|js|tsx|jsx)$/.test(filePath)) {
      const routePath = filePath.replace(/.*\/app\/api\//, "/api/").replace(/\/route\.(ts|js|tsx|jsx)$/, "");
      const exportMethods = content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g);
      if (exportMethods) {
        for (const em of exportMethods) {
          const method = em.replace(/.*\s/, "");
          this.addEndpoint(method, routePath, filePath, 1);
        }
      }
    }

    // Next.js Pages Router: pages/api/*.ts
    if (/\/pages\/api\//.test(filePath)) {
      const routePath = filePath.replace(/.*\/pages\/api\//, "/api/").replace(/\.(ts|js|tsx|jsx)$/, "");
      this.addEndpoint("GET", routePath, filePath, 1);
    }

    // Prisma model
    if (filePath.endsWith(".prisma") || /schema\.prisma/.test(filePath)) {
      const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
      while ((m = modelRegex.exec(content)) !== null) {
        const cols = this.parsePrismaFields(m[2]);
        this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
      }
    }

    // TypeORM @Entity
    if (/@Entity\s*\(/.test(content)) {
      const entityClassRegex = /@Entity\s*\([^)]*\)\s*(?:export\s+)?class\s+(\w+)/g;
      while ((m = entityClassRegex.exec(content)) !== null) {
        const cols = this.extractTypeOrmColumns(content);
        this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
      }
    }

    // Sequelize: Model.init({ field: ... }, { ... })
    const sequelizeRegex = /class\s+(\w+)\s+extends\s+Model\b/g;
    while ((m = sequelizeRegex.exec(content)) !== null) {
      this.entities.push({ name: m[1], filePath, columns: [], relations: [] });
    }
  }

  private parsePrismaFields(body: string): any[] {
    const cols: any[] = [];
    const lines = body.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;
      const match = trimmed.match(/^(\w+)\s+(\w+)(\??)/);
      if (match) {
        cols.push({
          name: match[1],
          type: match[2],
          nullable: match[3] === "?",
          primary: trimmed.includes("@id"),
        });
      }
    }
    return cols;
  }

  private extractTypeOrmColumns(content: string): any[] {
    const cols: any[] = [];
    const colRegex = /@(?:Primary)?(?:Generated)?Column\s*\([^)]*\)\s*(\w+)\s*[:?]\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = colRegex.exec(content)) !== null) {
      cols.push({
        name: m[1],
        type: m[2],
        primary: content.substring(Math.max(0, m.index - 30), m.index).includes("Primary"),
      });
    }
    return cols;
  }

  // ─── Python ──────────────────────────────────────────────────

  private detectPython(filePath: string, content: string): void {
    // FastAPI: @app.get('/path'), @router.post('/path')
    const fastapiRegex = /@(?:app|router|api)\.(get|post|put|patch|delete|websocket)\s*\(\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = fastapiRegex.exec(content)) !== null) {
      this.addEndpoint(m[1].toUpperCase(), m[2], filePath, this.lineFromOffset(content, m.index));
    }

    // Flask: @app.route('/path', methods=['GET', 'POST'])
    const flaskRegex = /@(?:app|bp|blueprint)\.route\s*\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/g;
    while ((m = flaskRegex.exec(content)) !== null) {
      const path = m[1];
      const methods = m[2] ? m[2].match(/["'](\w+)["']/g)?.map((s) => s.replace(/["']/g, "")) || ["GET"] : ["GET"];
      for (const method of methods) {
        this.addEndpoint(method.toUpperCase(), path, filePath, this.lineFromOffset(content, m.index));
      }
    }

    // Django urls.py: path('users/', views.user_list, name='user_list')
    if (/urls\.py$/.test(filePath)) {
      const djangoRegex = /(?:path|re_path|url)\s*\(\s*r?["']([^"']+)["']/g;
      while ((m = djangoRegex.exec(content)) !== null) {
        this.addEndpoint("GET", "/" + m[1].replace(/^\//, ""), filePath, this.lineFromOffset(content, m.index));
      }
    }

    // Django REST Framework: class UserViewSet(viewsets.ModelViewSet)
    const drfRegex = /class\s+(\w+ViewSet|\w+View)\s*\(([^)]+)\)/g;
    while ((m = drfRegex.exec(content)) !== null) {
      if (/(?:ViewSet|GenericAPIView|APIView)/.test(m[2])) {
        // Generic CRUD endpoints
        const name = m[1].replace(/(ViewSet|View)$/, "").toLowerCase();
        const basePath = `/${name}s`;
        if (m[2].includes("ModelViewSet")) {
          this.addEndpoint("GET", basePath, filePath, this.lineFromOffset(content, m.index));
          this.addEndpoint("POST", basePath, filePath, this.lineFromOffset(content, m.index));
          this.addEndpoint("GET", `${basePath}/{id}`, filePath, this.lineFromOffset(content, m.index));
          this.addEndpoint("PUT", `${basePath}/{id}`, filePath, this.lineFromOffset(content, m.index));
          this.addEndpoint("DELETE", `${basePath}/{id}`, filePath, this.lineFromOffset(content, m.index));
        }
      }
    }

    // SQLAlchemy: class User(Base)
    const sqlAlchRegex = /class\s+(\w+)\s*\(\s*(?:Base|db\.Model|Model)\s*\)/g;
    while ((m = sqlAlchRegex.exec(content)) !== null) {
      const cols = this.extractSqlAlchemyColumns(content, m.index);
      this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
    }

    // Django models: class User(models.Model)
    const djangoModelRegex = /class\s+(\w+)\s*\(\s*models\.Model\s*\)/g;
    while ((m = djangoModelRegex.exec(content)) !== null) {
      const cols = this.extractDjangoColumns(content, m.index);
      this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
    }
  }

  private extractSqlAlchemyColumns(content: string, classStart: number): any[] {
    const cols: any[] = [];
    const block = content.substring(classStart, classStart + 3000);
    const colRegex = /(\w+)\s*=\s*Column\s*\(\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = colRegex.exec(block)) !== null) {
      cols.push({ name: m[1], type: m[2], primary: block.substring(m.index, m.index + 200).includes("primary_key=True") });
    }
    return cols;
  }

  private extractDjangoColumns(content: string, classStart: number): any[] {
    const cols: any[] = [];
    const block = content.substring(classStart, classStart + 3000);
    const colRegex = /(\w+)\s*=\s*models\.(\w+Field)/g;
    let m: RegExpExecArray | null;
    while ((m = colRegex.exec(block)) !== null) {
      cols.push({ name: m[1], type: m[2].replace("Field", "") });
    }
    return cols;
  }

  // ─── Java ────────────────────────────────────────────────────

  private detectJava(filePath: string, content: string): void {
    // Spring: @RequestMapping at class level for prefix
    const classMappingMatch = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']*)["']/);
    const prefix = classMappingMatch ? "/" + classMappingMatch[1].replace(/^\//, "") : "";

    // Spring methods: @GetMapping, @GetMapping('/path'), @PostMapping
    // Two cases: with parens or without
    const springRegex = /@(Get|Post|Put|Patch|Delete|Request)Mapping(?:\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["'])?(?:[^)]*method\s*=\s*RequestMethod\.(\w+))?[^)]*\))?/g;
    let m: RegExpExecArray | null;
    while ((m = springRegex.exec(content)) !== null) {
      let method = m[1] === "Request" ? (m[3] || "GET") : m[1].toUpperCase();
      const subPath = m[2] || "";
      const fullPath = (prefix + (subPath ? "/" + subPath : "")).replace(/\/+/g, "/") || "/";
      this.addEndpoint(method.toUpperCase(), fullPath, filePath, this.lineFromOffset(content, m.index));
    }

    // JAX-RS @Path
    const jaxRsRegex = /@(GET|POST|PUT|DELETE|PATCH)\s*[\s\S]{0,100}?@Path\s*\(\s*["']([^"']+)["']/g;
    while ((m = jaxRsRegex.exec(content)) !== null) {
      this.addEndpoint(m[1], m[2], filePath, this.lineFromOffset(content, m.index));
    }

    // JPA @Entity
    if (/@Entity\b/.test(content)) {
      const entityRegex = /@Entity\b[^{]*?class\s+(\w+)/g;
      while ((m = entityRegex.exec(content)) !== null) {
        const cols = this.extractJpaColumns(content);
        this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
      }
    }
  }

  private extractJpaColumns(content: string): any[] {
    const cols: any[] = [];
    const colRegex = /@(?:Column|Id)\b[^;]*?\s+(?:private|public|protected)\s+(\w+)\s+(\w+)\s*[;=]/g;
    let m: RegExpExecArray | null;
    while ((m = colRegex.exec(content)) !== null) {
      const before = content.substring(Math.max(0, m.index - 50), m.index);
      cols.push({ name: m[2], type: m[1], primary: before.includes("@Id") });
    }
    return cols;
  }

  // ─── Go ──────────────────────────────────────────────────────

  private detectGo(filePath: string, content: string): void {
    // gin/echo/chi/fiber: r.GET("/path", handler) or e.POST(...)
    const ginRegex = /\b\w+\s*\.\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*["`]([^"`]+)["`]/g;
    let m: RegExpExecArray | null;
    while ((m = ginRegex.exec(content)) !== null) {
      this.addEndpoint(m[1], m[2], filePath, this.lineFromOffset(content, m.index));
    }

    // gorilla/mux: r.HandleFunc("/path", handler).Methods("GET")
    const muxRegex = /HandleFunc\s*\(\s*["`]([^"`]+)["`][^)]+\)\s*\.\s*Methods\s*\(\s*["`](\w+)["`]/g;
    while ((m = muxRegex.exec(content)) !== null) {
      this.addEndpoint(m[2], m[1], filePath, this.lineFromOffset(content, m.index));
    }

    // net/http: http.HandleFunc("/path", handler)
    const httpRegex = /http\.HandleFunc\s*\(\s*["`]([^"`]+)["`]/g;
    while ((m = httpRegex.exec(content)) !== null) {
      this.addEndpoint("GET", m[1], filePath, this.lineFromOffset(content, m.index));
    }

    // GORM model: type User struct { ... gorm.Model ... }
    const gormRegex = /type\s+(\w+)\s+struct\s*\{([\s\S]*?)\}/g;
    while ((m = gormRegex.exec(content)) !== null) {
      if (m[2].includes("gorm.") || m[2].includes("`gorm:")) {
        const cols = this.extractGormColumns(m[2]);
        this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
      }
    }
  }

  private extractGormColumns(body: string): any[] {
    const cols: any[] = [];
    const lines = body.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const match = trimmed.match(/^(\w+)\s+(\*?\w+)/);
      if (match && !["gorm", "Model"].includes(match[1])) {
        cols.push({
          name: match[1],
          type: match[2],
          primary: line.includes("primaryKey") || line.includes("primary_key"),
        });
      }
    }
    return cols;
  }

  // ─── Rust ────────────────────────────────────────────────────

  private detectRust(filePath: string, content: string): void {
    // Actix-web: #[get("/path")], #[post("/path")]
    const actixRegex = /#\[(get|post|put|patch|delete|head)\s*\(\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = actixRegex.exec(content)) !== null) {
      this.addEndpoint(m[1].toUpperCase(), m[2], filePath, this.lineFromOffset(content, m.index));
    }

    // Rocket: #[get("/path")] (same as actix syntax-wise)
    // Already covered by above

    // Axum: Router::new().route("/path", get(handler))
    const axumRegex = /\.route\s*\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(/gi;
    while ((m = axumRegex.exec(content)) !== null) {
      this.addEndpoint(m[2].toUpperCase(), m[1], filePath, this.lineFromOffset(content, m.index));
    }

    // Diesel schema: table! { users (id) { id -> Integer, ... } }
    const dieselRegex = /table!\s*\{\s*(\w+)[^{]*\{([^}]+)\}/g;
    while ((m = dieselRegex.exec(content)) !== null) {
      const cols: any[] = [];
      const colLines = m[2].matchAll(/(\w+)\s*->\s*(\w+)/g);
      for (const cl of colLines) {
        cols.push({ name: cl[1], type: cl[2] });
      }
      this.entities.push({ name: m[1], filePath, columns: cols, relations: [] });
    }
  }

  // ─── Swift (Vapor) ───────────────────────────────────────────

  private detectSwift(filePath: string, content: string): void {
    // Vapor: app.get("path") { req in ... }, app.post(...)
    const vaporRegex = /\b(?:app|routes|router|group)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = vaporRegex.exec(content)) !== null) {
      this.addEndpoint(m[1].toUpperCase(), m[2], filePath, this.lineFromOffset(content, m.index));
    }

    // Fluent (Vapor ORM): final class User: Model
    const fluentRegex = /(?:final\s+)?class\s+(\w+)\s*:\s*(?:Model|Content)\b/g;
    while ((m = fluentRegex.exec(content)) !== null) {
      this.entities.push({ name: m[1], filePath, columns: [], relations: [] });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private addEndpoint(method: string, path: string, filePath: string, line: number): void {
    // Dedupe
    const key = `${method}:${path}:${filePath}`;
    if (this.endpoints.some((e) => `${e.method}:${e.path}:${e.filePath}` === key)) return;

    const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "WS"] as const;
    const m = validMethods.includes(method as any) ? (method as ApiEndpoint["method"]) : "GET";

    this.endpoints.push({
      method: m,
      path: path.startsWith("/") ? path : "/" + path,
      handler: `${filePath}:${line}`,
      filePath,
      line,
    });
  }

  private lineFromOffset(content: string, offset: number): number {
    return content.substring(0, offset).split("\n").length;
  }
}
