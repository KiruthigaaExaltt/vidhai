export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 200;

export type PaginationParams = {
  skip: number;
  limit: number;
  currentPage: number;
};

const integer = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export function paginateQuery(
  query: Record<string, unknown>,
  defaultLimit = DEFAULT_PAGE_SIZE,
): PaginationParams {
  const safeDefault = Math.min(MAX_PAGE_SIZE, Math.max(1, defaultLimit));
  const skip = Math.max(0, integer(query.skip, 0));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, integer(query.limit, safeDefault)),
  );

  return { skip, limit, currentPage: Math.floor(skip / limit) + 1 };
}

export function paginationMetadata(
  totalCount: number,
  pagination: PaginationParams,
) {
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  return {
    totalCount: safeTotal,
    currentPage: pagination.currentPage,
    pageSize: pagination.limit,
    totalPages: Math.ceil(safeTotal / pagination.limit),
  };
}

export function paginatedResponse<T>(
  data: T[],
  totalCount: number,
  pagination: PaginationParams,
) {
  return { data, ...paginationMetadata(totalCount, pagination) };
}
