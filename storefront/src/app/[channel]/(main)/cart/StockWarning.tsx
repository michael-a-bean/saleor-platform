/**
 * Stock Warning Component
 *
 * Displays warnings for items with insufficient stock.
 */

export interface StockIssue {
  variantId: string;
  productName: string;
  requested: number;
  available: number | null;
}

interface StockWarningProps {
  issues: StockIssue[];
}

export function StockWarning({ issues }: StockWarningProps) {
  if (issues.length === 0) {
    return null;
  }

  const outOfStock = issues.filter((i) => i.available === 0);
  const lowStock = issues.filter((i) => i.available !== null && i.available > 0 && i.available < i.requested);

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-800">Stock Availability Issues</h3>

      {outOfStock.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-red-700">Out of Stock:</p>
          <ul className="mt-1 text-sm text-red-600">
            {outOfStock.map((item) => (
              <li key={item.variantId}>• {item.productName}</li>
            ))}
          </ul>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-amber-700">Insufficient Stock:</p>
          <ul className="mt-1 text-sm text-amber-600">
            {lowStock.map((item) => (
              <li key={item.variantId}>
                • {item.productName}: {item.available} available (you requested {item.requested})
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm text-neutral-600">
        Please update quantities or remove items before proceeding to checkout.
      </p>
    </div>
  );
}

/**
 * Calculate stock issues from checkout lines
 */
export function calculateStockIssues(
  lines: Array<{
    quantity: number;
    variant: {
      id: string;
      quantityAvailable?: number | null;
      product: {
        name: string;
      };
    };
  }>
): StockIssue[] {
  const issues: StockIssue[] = [];

  for (const line of lines) {
    const available = line.variant.quantityAvailable ?? null;

    // If quantityAvailable is null, we can't validate (skip)
    if (available === null) {
      continue;
    }

    if (available < line.quantity) {
      issues.push({
        variantId: line.variant.id,
        productName: line.variant.product.name,
        requested: line.quantity,
        available,
      });
    }
  }

  return issues;
}
