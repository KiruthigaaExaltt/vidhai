import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PageToken = number | "ellipsis-left" | "ellipsis-right";

const pageTokens = (currentPage: number, totalPages: number): PageToken[] => {
  if (totalPages <= 7)
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: PageToken[] = [1];
  if (currentPage > 4) pages.push("ellipsis-left");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (currentPage < totalPages - 3) pages.push("ellipsis-right");
  pages.push(totalPages);
  return pages;
};

export type DataPaginationProps = {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
  className?: string;
};

export function DataPagination({
  currentPage,
  pageSize,
  totalCount,
  totalPages = Math.ceil(totalCount / pageSize),
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100, 150, 200],
  loading = false,
  className,
}: DataPaginationProps) {
  const pages = Math.max(0, totalPages);
  const page = pages ? Math.min(Math.max(1, currentPage), pages) : 1;
  const from = totalCount ? (page - 1) * pageSize + 1 : 0;
  const to = totalCount ? Math.min(page * pageSize, totalCount) : 0;
  const disabled = loading || totalCount === 0;
  const sizes = pageSizeOptions;
  const go = (nextPage: number) => {
    if (!loading && nextPage >= 1 && nextPage <= pages && nextPage !== page) {
      onPageChange(nextPage);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      aria-busy={loading}
    >
      <div className="flex items-center gap-2" aria-live="polite">
        <span>
          Showing <strong className="text-foreground">{from}</strong> to{" "}
          <strong className="text-foreground">{to}</strong> of{" "}
          <strong className="text-foreground">{totalCount}</strong> records
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-4">
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            disabled={loading}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[72px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Previous page"
                title="Previous page"
                disabled={disabled || page === 1}
                onClick={() => go(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            </PaginationItem>
            {pageTokens(page, pages).map((token) =>
              typeof token === "number" ? (
                <PaginationItem key={token}>
                  <Button
                    type="button"
                    variant={token === page ? "outline" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    aria-current={token === page ? "page" : undefined}
                    aria-label={`Go to page ${token}`}
                    disabled={loading}
                    onClick={() => go(token)}
                  >
                    {token}
                  </Button>
                </PaginationItem>
              ) : (
                <PaginationItem key={token}>
                  <PaginationEllipsis />
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label="Next page"
                title="Next page"
                disabled={disabled || page === pages}
                onClick={() => go(page + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
