import { describe, it, expect } from "vitest";
import { MIGRATIONS, splitStatements } from "./migrations";

describe("splitStatements", () => {
  it("splits simple statements", () => {
    const result = splitStatements("CREATE TABLE foo (id INT); CREATE TABLE bar (id INT);");
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("CREATE TABLE foo (id INT)");
    expect(result[1]).toBe("CREATE TABLE bar (id INT)");
  });

  it("keeps trigger body intact", () => {
    const sql = `
      CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, subject) VALUES (new.rowid, new.subject);
      END;
    `;
    const result = splitStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("BEGIN");
    expect(result[0]).toContain("END");
    expect(result[0]).toContain("INSERT INTO messages_fts");
  });

  it("handles multiple triggers", () => {
    const sql = `
      CREATE TABLE foo (id INT);

      CREATE TRIGGER t1 AFTER INSERT ON foo BEGIN
        INSERT INTO bar VALUES (new.id);
      END;

      CREATE TRIGGER t2 AFTER DELETE ON foo BEGIN
        DELETE FROM bar WHERE id = old.id;
      END;
    `;
    const result = splitStatements(sql);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("CREATE TABLE");
    expect(result[1]).toContain("CREATE TRIGGER t1");
    expect(result[2]).toContain("CREATE TRIGGER t2");
  });

  it("handles trigger with multiple statements inside BEGIN...END", () => {
    const sql = `
      CREATE TRIGGER t1 AFTER UPDATE ON messages BEGIN
        INSERT INTO fts(fts, rowid, subject) VALUES ('delete', old.rowid, old.subject);
        INSERT INTO fts(rowid, subject) VALUES (new.rowid, new.subject);
      END;
    `;
    const result = splitStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("BEGIN");
    expect(result[0]).toContain("END");
  });

  it("handles empty input", () => {
    expect(splitStatements("")).toHaveLength(0);
    expect(splitStatements("   ")).toHaveLength(0);
  });

  it("does not match END inside words like BACKEND", () => {
    const sql = "CREATE TABLE backend (id INT); CREATE TABLE foo (id INT);";
    const result = splitStatements(sql);
    expect(result).toHaveLength(2);
  });
});

describe("migration indexes", () => {
  it("creates every index with IF NOT EXISTS so a half-applied version can finish", () => {
    const bare = MIGRATIONS.flatMap((migration) =>
      splitStatements(migration.sql).filter((statement) =>
        /^\s*CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(statement),
      ),
    );
    expect(bare).toEqual([]);
  });
});
