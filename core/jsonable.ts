export type JSONable = {
    [key in string | number]?: string | number | boolean | JSONable | JSONable[];
};
