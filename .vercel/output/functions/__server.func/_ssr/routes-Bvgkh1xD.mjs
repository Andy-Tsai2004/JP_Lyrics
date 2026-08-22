import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { N as isRedirect, _ as useRouter, v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
import { n as Music2, r as LoaderCircle } from "../_libs/lucide-react.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Bvgkh1xD.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function useServerFn(serverFn) {
	const router = useRouter();
	return import_react.useCallback(async (...args) => {
		try {
			const res = await serverFn(...args);
			if (isRedirect(res)) throw res;
			return res;
		} catch (err) {
			if (isRedirect(err)) {
				err.options._fromLocation = router.stores.location.get();
				return router.navigate(router.resolveRedirect(err).options);
			}
			throw err;
		}
	}, [router, serverFn]);
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[opacity,transform,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.98]", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:opacity-90",
			outline: "border border-border bg-transparent text-foreground hover:bg-surface-2",
			ghost: "text-muted hover:bg-surface-2 hover:text-foreground"
		},
		size: {
			default: "h-11 px-5",
			sm: "h-9 px-3 text-xs",
			icon: "size-11"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		...props
	});
}
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		suppressHydrationWarning: true,
		className: cn("h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-subtle", "transition-[border-color,box-shadow] duration-150", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70", "disabled:opacity-50", className),
		...props
	});
}
function LyricsDisplay({ lines, showFurigana }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "space-y-1",
		children: lines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: cn("font-serif text-[1.35rem] leading-[2.35] text-foreground sm:text-[1.5rem] sm:leading-[2.5]", showFurigana && "pt-1"),
			children: showFurigana ? line.tokens.map((token, j) => token.furigana ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ruby", {
				className: "ruby-token",
				children: [token.text, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rt", { children: token.furigana })]
			}, j) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: token.text }, j)) : line.text
		}, `${i}-${line.text}`))
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var fetchBahamutLyrics = createServerFn({ method: "POST" }).validator(object({ url: string().min(8) })).handler(createSsrRpc("9f2bc4f468457a5ece8cfdf7a7dc28ee0bfbff709086b2588d2fbda778f1eb15"));
var SAMPLE_URL = "https://home.gamer.com.tw/artwork.php?sn=6306141";
function LyricsApp() {
	const fetchLyrics = useServerFn(fetchBahamutLyrics);
	const [url, setUrl] = (0, import_react.useState)(SAMPLE_URL);
	const [showFurigana, setShowFurigana] = (0, import_react.useState)(true);
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [result, setResult] = (0, import_react.useState)(null);
	async function runFetch(target) {
		setLoading(true);
		setError(null);
		try {
			const data = await fetchLyrics({ data: { url: target } });
			setResult(data);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not fetch lyrics.";
			setError(message.replace(/^Error:\s*/, ""));
			setResult(null);
		} finally {
			setLoading(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "space-y-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium tracking-[0.18em] text-muted uppercase",
						children: "歌詞ビューア"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-serif text-3xl font-medium tracking-tight text-balance text-foreground sm:text-4xl",
						children: "Japanese Lyrics Viewer"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "max-w-xl text-sm leading-relaxed text-pretty text-muted",
						children: "Paste a Bahamut artwork link. The viewer keeps only the Japanese lines and places hiragana above each kanji."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				className: "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:p-3",
				onSubmit: (e) => {
					e.preventDefault();
					runFetch(url);
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: "sr-only",
						htmlFor: "bahamut-url",
						children: "Bahamut lyrics URL"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						id: "bahamut-url",
						value: url,
						onChange: (e) => setUrl(e.target.value),
						placeholder: "https://home.gamer.com.tw/artwork.php?sn=…",
						inputMode: "url",
						autoComplete: "url",
						className: "border-0 bg-transparent shadow-none focus-visible:ring-0"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						disabled: loading || !url.trim(),
						className: "shrink-0",
						children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }), "Fetching"] }) : "Fetch lyrics"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "min-h-11 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline",
					onClick: () => {
						setUrl(SAMPLE_URL);
						runFetch(SAMPLE_URL);
					},
					disabled: loading,
					children: "Try the sample post"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "switch",
					"aria-checked": showFurigana,
					onClick: () => setShowFurigana((v) => !v),
					className: "flex min-h-11 items-center gap-3 text-sm text-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: cn("relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors duration-150", showFurigana ? "border-primary bg-primary" : "bg-surface-2"),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("block size-5 rounded-full bg-foreground shadow-sm transition-transform duration-150", showFurigana ? "translate-x-[22px] bg-primary-foreground" : "translate-x-0.5") })
					}), "Show furigana"]
				})]
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "alert",
				className: "rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger",
				children: error
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "min-h-72 rounded-[28px] border border-border bg-paper px-5 py-8 sm:px-10 sm:py-12",
				children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-5",
					"aria-busy": "true",
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Reading the post and adding readings…"
					}), [
						"w-5/6",
						"w-2/3",
						"w-4/5",
						"w-3/5",
						"w-3/4",
						"w-2/3",
						"w-5/6",
						"w-1/2"
					].map((width, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("h-5 animate-pulse rounded-md bg-surface-2", width) }, i))]
				}) : result ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-8",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-1 border-b border-border pb-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs tracking-wide text-muted",
							children: "Japanese only"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-serif text-lg leading-snug text-pretty text-foreground",
							children: result.title
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LyricsDisplay, {
						lines: result.lines,
						showFurigana
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-h-56 flex-col items-center justify-center gap-3 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, {
						className: "size-8 text-subtle",
						strokeWidth: 1.5
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "max-w-sm text-sm leading-relaxed text-muted",
						children: "Lyrics will appear here with furigana over the kanji, in the same ruby style as UtaTen."
					})]
				})
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-dvh bg-bg",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LyricsApp, {})
	});
}
//#endregion
export { Home as component };
