import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FrameworkDetector } from "../analyzers/framework-detector.js";

let tempDir: string;

function writeFile(name: string, content: string): string {
  const fp = path.join(tempDir, name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);
  return fp;
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "archlens-fd-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("FrameworkDetector", () => {
  describe("TypeScript", () => {
    it("detects Express endpoints", () => {
      const fp = writeFile("server.ts", `
        const app = express();
        app.get('/users', getUsersHandler);
        app.post('/users', createUserHandler);
        app.delete('/users/:id', deleteUserHandler);
        router.put('/products/:id', updateProductHandler);
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.endpoints).toHaveLength(4);
      expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toContain("GET /users");
      expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toContain("POST /users");
      expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toContain("DELETE /users/:id");
      expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toContain("PUT /products/:id");
    });

    it("detects NestJS controller endpoints", () => {
      const fp = writeFile("user.controller.ts", `
        @Controller('users')
        export class UserController {
          @Get()
          findAll() { return []; }

          @Get(':id')
          findOne() { return {}; }

          @Post()
          create() { return {}; }
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.endpoints.length).toBeGreaterThanOrEqual(3);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("POST /users");
      expect(paths.some((p) => p.includes(":id"))).toBe(true);
    });

    it("detects Next.js App Router endpoints", () => {
      const fp = writeFile("app/api/users/route.ts", `
        export async function GET(req: Request) { return Response.json([]); }
        export async function POST(req: Request) { return Response.json({}); }
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /api/users");
      expect(paths).toContain("POST /api/users");
    });

    it("detects Prisma models", () => {
      const fp = writeFile("schema.prisma", `
        model User {
          id    Int     @id @default(autoincrement())
          email String  @unique
          name  String?
          posts Post[]
        }
        model Post {
          id     Int    @id
          title  String
          userId Int
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map((e) => e.name)).toContain("User");
      expect(result.entities.map((e) => e.name)).toContain("Post");
      const user = result.entities.find((e) => e.name === "User")!;
      expect(user.columns.length).toBeGreaterThan(0);
      expect(user.columns.find((c) => c.primary)?.name).toBe("id");
    });

    it("detects TypeORM entities", () => {
      const fp = writeFile("user.entity.ts", `
        @Entity('users')
        export class User {
          @PrimaryGeneratedColumn()
          id: number;
          @Column()
          name: string;
          @Column()
          email: string;
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.entities.map((e) => e.name)).toContain("User");
    });
  });

  describe("Python", () => {
    it("detects FastAPI endpoints", () => {
      const fp = writeFile("main.py", `
        from fastapi import FastAPI
        app = FastAPI()

        @app.get("/items")
        def list_items(): return []

        @app.post("/items")
        def create_item(): return {}

        @router.delete("/items/{id}")
        def delete_item(id: int): return None
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /items");
      expect(paths).toContain("POST /items");
      expect(paths.some((p) => p.includes("/items/{id}"))).toBe(true);
    });

    it("detects Flask endpoints with methods", () => {
      const fp = writeFile("app.py", `
        from flask import Flask
        app = Flask(__name__)

        @app.route("/users", methods=['GET', 'POST'])
        def users(): return []

        @bp.route("/single")
        def single(): return {}
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("POST /users");
      expect(paths).toContain("GET /single");
    });

    it("detects Django URLs", () => {
      const fp = writeFile("api/urls.py", `
        from django.urls import path
        urlpatterns = [
            path('users/', views.user_list),
            path('users/<int:id>/', views.user_detail),
        ]
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.endpoints.length).toBeGreaterThanOrEqual(2);
    });

    it("detects SQLAlchemy models", () => {
      const fp = writeFile("models.py", `
        from sqlalchemy import Column, Integer, String
        Base = declarative_base()

        class User(Base):
            __tablename__ = 'users'
            id = Column(Integer, primary_key=True)
            name = Column(String)
            email = Column(String)
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.entities.map((e) => e.name)).toContain("User");
      const user = result.entities.find((e) => e.name === "User")!;
      expect(user.columns.length).toBeGreaterThan(0);
    });

    it("detects Django models", () => {
      const fp = writeFile("models.py", `
        from django.db import models

        class Article(models.Model):
            title = models.CharField(max_length=200)
            content = models.TextField()
            published = models.DateTimeField()
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.entities.map((e) => e.name)).toContain("Article");
    });
  });

  describe("Java (Spring Boot)", () => {
    it("detects Spring REST controllers", () => {
      const fp = writeFile("UserController.java", `
        @RestController
        @RequestMapping("/api/users")
        public class UserController {
            @GetMapping
            public List<User> findAll() { return null; }

            @GetMapping("/{id}")
            public User findOne(@PathVariable Long id) { return null; }

            @PostMapping
            public User create(@RequestBody User user) { return user; }

            @DeleteMapping("/{id}")
            public void delete(@PathVariable Long id) {}
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.endpoints.length).toBeGreaterThanOrEqual(4);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /api/users");
      expect(paths).toContain("POST /api/users");
    });

    it("detects JPA entities", () => {
      const fp = writeFile("User.java", `
        @Entity
        public class User {
            @Id
            private Long id;
            @Column
            private String name;
            @Column
            private String email;
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.entities.map((e) => e.name)).toContain("User");
    });
  });

  describe("Go", () => {
    it("detects gin/echo endpoints", () => {
      const fp = writeFile("main.go", `
        func main() {
          r := gin.Default()
          r.GET("/users", listUsers)
          r.POST("/users", createUser)
          r.DELETE("/users/:id", deleteUser)
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("POST /users");
    });

    it("detects GORM models", () => {
      const fp = writeFile("models.go", `
        type User struct {
          gorm.Model
          ID    uint   \`gorm:"primaryKey"\`
          Name  string \`gorm:"size:100"\`
          Email string \`gorm:"uniqueIndex"\`
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.entities.map((e) => e.name)).toContain("User");
    });
  });

  describe("Rust", () => {
    it("detects Actix-web endpoints", () => {
      const fp = writeFile("handlers.rs", `
        #[get("/users")]
        async fn list_users() -> impl Responder { "" }

        #[post("/users")]
        async fn create_user() -> impl Responder { "" }
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("POST /users");
    });

    it("detects Axum routes", () => {
      const fp = writeFile("main.rs", `
        let app = Router::new()
          .route("/users", get(list_users))
          .route("/users", post(create_user));
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("POST /users");
    });
  });

  describe("Swift (Vapor)", () => {
    it("detects Vapor endpoints", () => {
      const fp = writeFile("routes.swift", `
        func routes(_ app: Application) throws {
          app.get("users") { req in [] }
          app.post("users") { req in "" }
        }
      `);
      const result = new FrameworkDetector().detect([fp]);
      const paths = result.endpoints.map((e) => `${e.method} ${e.path}`);
      expect(paths).toContain("GET /users");
      expect(paths).toContain("POST /users");
    });
  });

  describe("Edge cases", () => {
    it("dedupes identical endpoints", () => {
      const fp = writeFile("a.ts", `
        app.get('/x', h);
        app.get('/x', h);
      `);
      const result = new FrameworkDetector().detect([fp]);
      expect(result.endpoints.filter((e) => e.path === "/x").length).toBe(1);
    });

    it("handles empty files", () => {
      const fp = writeFile("empty.ts", "");
      const result = new FrameworkDetector().detect([fp]);
      expect(result.endpoints).toHaveLength(0);
    });

    it("handles non-existent files gracefully", () => {
      const result = new FrameworkDetector().detect(["/nonexistent/file.ts"]);
      expect(result.endpoints).toHaveLength(0);
    });
  });
});
