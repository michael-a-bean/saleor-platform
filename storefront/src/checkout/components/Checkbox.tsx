import { useFormContext } from "@/checkout/hooks/useForm";

interface CheckboxProps<TName extends string> {
	name: TName;
	label: string;
}

export const Checkbox = <TName extends string>({ name, label }: CheckboxProps<TName>) => {
	const { values, setFieldValue } = useFormContext<Record<TName, any>>();
	const value = values[name];

	return (
		<label className="inline-flex items-center gap-x-2">
			<input
				name={name}
				checked={!!value}
				onChange={() => setFieldValue(name as Extract<TName, string>, !value)}
				type="checkbox"
				className="rounded border-neutral-300 text-neutral-600 shadow-sm focus:border-neutral-300 focus:ring focus:ring-neutral-200 focus:ring-opacity-50 focus:ring-offset-0"
			/>
			<span>{label}</span>
		</label>
	);
};
