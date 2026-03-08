import { type AllHTMLAttributes } from "react";
import clsx from "clsx";
import { useField } from "@/checkout/hooks/useForm/useField";

export interface TextInputProps<TName extends string> extends AllHTMLAttributes<HTMLInputElement> {
	name: TName;
	label: string;
}

export const TextInput = <TName extends string>({
	name,
	label,
	required,
	className,
	...props
}: TextInputProps<TName>) => {
	const { error, value, onChange, handleBlur } = useField(name);

	return (
		<div className="space-y-0.5">
			<label className="flex flex-col">
				<span className="text-xs text-neutral-700">
					{label}
					{required && <span aria-hidden="true">*</span>}
				</span>
				<input
					required={required}
					spellCheck={false}
					name={name}
					value={value ?? ""}
					onChange={onChange}
					onBlur={handleBlur}
					{...props}
					className={clsx(
						"mt-0.5 w-full appearance-none rounded-md border-neutral-300 shadow-sm transition-colors focus:border-neutral-300 focus:outline-none focus:ring focus:ring-neutral-200 focus:ring-opacity-50 active:border-neutral-200 active:outline-none",
						{ "border-red-300": error },
						className,
					)}
				/>
			</label>
			{error && <p className="text-sm text-red-500">{error}</p>}
		</div>
	);
};
