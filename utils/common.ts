export const formatResponse = (code: number, message: string, data: { [key: string]: unknown } | string) => {
  return {
    code,
    message,
    data
  };
};
