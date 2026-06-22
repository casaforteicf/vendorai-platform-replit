import { vi } from "vitest";

export type MockRow = { id: string; tenantId: string; [k: string]: unknown };

export interface DbMocks {
  mockDbSelect: ReturnType<typeof vi.fn>;
  mockDbUpdate?: ReturnType<typeof vi.fn>;
  mockDbDelete?: ReturnType<typeof vi.fn>;
  mockDbInsert?: ReturnType<typeof vi.fn>;
}

export function createDbHelpers(mocks: DbMocks) {
  const { mockDbSelect, mockDbUpdate, mockDbDelete, mockDbInsert } = mocks;

  return {
    setupSelectReturning(rows: MockRow[]) {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(rows),
        orderBy: vi.fn().mockResolvedValue(rows),
        and: vi.fn().mockReturnThis(),
      };
      mockDbSelect.mockReturnValue(chain);
    },

    setupListSelectReturning(rows: MockRow[]) {
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(rows),
        and: vi.fn().mockReturnThis(),
      };
      mockDbSelect.mockReturnValue(chain);
    },

    setupSequentialSelects(...rowArrays: MockRow[][]) {
      rowArrays.forEach((rows) => {
        const chain = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(rows),
          orderBy: vi.fn().mockResolvedValue(rows),
          and: vi.fn().mockReturnThis(),
        };
        mockDbSelect.mockReturnValueOnce(chain);
      });
    },

    setupUpdateReturning(rows: MockRow[]) {
      const returning = vi.fn().mockResolvedValue(rows);
      const where = vi.fn().mockReturnValue({ returning });
      const set = vi.fn().mockReturnValue({ where });
      mockDbUpdate!.mockReturnValue({ set });
    },

    setupDeleteSuccess() {
      const where = vi.fn().mockResolvedValue(undefined);
      mockDbDelete!.mockReturnValue({ where });
    },

    setupInsertReturning(rows: MockRow[]) {
      const returning = vi.fn().mockResolvedValue(rows);
      const onConflictDoNothing = vi.fn().mockResolvedValue([]);
      const values = vi.fn().mockReturnValue({ returning, onConflictDoNothing });
      mockDbInsert!.mockReturnValue({ values });
    },

    setupInsertUniqueViolation() {
      const pgErr = Object.assign(new Error("duplicate key"), { code: "23505" });
      const returning = vi.fn().mockRejectedValue(pgErr);
      const onConflictDoNothing = vi.fn().mockResolvedValue([]);
      const values = vi.fn().mockReturnValue({ returning, onConflictDoNothing });
      mockDbInsert!.mockReturnValue({ values });
    },
  };
}
