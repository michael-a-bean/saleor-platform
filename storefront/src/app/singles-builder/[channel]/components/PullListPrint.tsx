"use client";

import { type CartLine } from "../store/singlesCartStore";

function getAttribute(
	attributes: Array<{ attribute: { slug: string }; values: Array<{ name: string }> }>,
	slug: string,
): string {
	return attributes.find((a) => a.attribute.slug === slug)?.values[0]?.name ?? "";
}

const CONDITION_ABBREV: Record<string, string> = {
	"Near Mint": "NM",
	"Lightly Played": "LP",
	"Moderately Played": "MP",
	"Heavily Played": "HP",
	Damaged: "DMG",
};

interface PullListRow {
	quantity: number;
	condition: string;
	finish: string;
	setCode: string;
	collectorNumber: string;
	cardName: string;
	price: string;
}

function buildRows(lines: CartLine[]): PullListRow[] {
	return lines
		.map((line) => {
			const conditionFull = getAttribute(line.variant.attributes, "mtg-condition");
			const condition = CONDITION_ABBREV[conditionFull] || conditionFull || "—";
			const finish = getAttribute(line.variant.attributes, "mtg-finish") || "—";
			const setCode = getAttribute(line.variant.product.attributes, "mtg-set-code");
			const collectorNumber = getAttribute(line.variant.product.attributes, "mtg-collector-number");

			return {
				quantity: line.quantity,
				condition,
				finish,
				setCode: setCode.toUpperCase(),
				collectorNumber,
				cardName: line.variant.product.name,
				price: line.totalPrice?.gross?.amount != null
					? `$${line.totalPrice.gross.amount.toFixed(2)}`
					: "—",
			};
		})
		.sort((a, b) => {
			// Sort by set code, then collector number (numeric), then card name
			const setCompare = a.setCode.localeCompare(b.setCode);
			if (setCompare !== 0) return setCompare;
			const numA = parseInt(a.collectorNumber, 10) || 0;
			const numB = parseInt(b.collectorNumber, 10) || 0;
			if (numA !== numB) return numA - numB;
			return a.cardName.localeCompare(b.cardName);
		});
}

interface PullListPrintProps {
	lines: CartLine[];
	channel: string;
	customerName: string;
	notes: string;
	shortCode: string | null;
	totalAmount: number;
	totalCurrency: string;
}

export function PullListPrint({
	lines,
	channel,
	customerName,
	notes,
	shortCode,
	totalAmount,
	totalCurrency,
}: PullListPrintProps) {
	const rows = buildRows(lines);
	const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);
	const now = new Date();
	const dateStr = now.toLocaleDateString("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const timeStr = now.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<div id="pull-list-print" className="pull-list-print">
			{/* Header */}
			<div className="pull-list-header">
				<div className="pull-list-title">
					<h1>Pull List</h1>
					<span className="pull-list-location">{channel}</span>
				</div>
				<div className="pull-list-meta">
					<div className="pull-list-meta-row">
						<span>Date: {dateStr} {timeStr}</span>
						{shortCode && <span className="pull-list-code">Code: {shortCode}</span>}
					</div>
					{customerName && (
						<div className="pull-list-meta-row">
							<span>Customer: {customerName}</span>
						</div>
					)}
					{notes && (
						<div className="pull-list-meta-row">
							<span>Notes: {notes}</span>
						</div>
					)}
				</div>
			</div>

			{/* Table */}
			<table className="pull-list-table">
				<thead>
					<tr>
						<th className="pull-list-col-check">&nbsp;</th>
						<th className="pull-list-col-qty">Qty</th>
						<th className="pull-list-col-cond">Cond</th>
						<th className="pull-list-col-finish">Finish</th>
						<th className="pull-list-col-set">Set</th>
						<th className="pull-list-col-num">#</th>
						<th className="pull-list-col-name">Card Name</th>
						<th className="pull-list-col-price">Price</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={i}>
							<td className="pull-list-col-check">
								<span className="pull-list-checkbox" />
							</td>
							<td className="pull-list-col-qty">{row.quantity}</td>
							<td className="pull-list-col-cond">{row.condition}</td>
							<td className="pull-list-col-finish">{row.finish}</td>
							<td className="pull-list-col-set">{row.setCode}</td>
							<td className="pull-list-col-num">{row.collectorNumber}</td>
							<td className="pull-list-col-name">{row.cardName}</td>
							<td className="pull-list-col-price">{row.price}</td>
						</tr>
					))}
				</tbody>
			</table>

			{/* Footer */}
			<div className="pull-list-footer">
				<span>{totalQty} items / {rows.length} unique cards</span>
				<span className="pull-list-total">
					Total: ${totalAmount.toFixed(2)} {totalCurrency}
				</span>
			</div>
		</div>
	);
}
