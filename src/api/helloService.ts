// Windows Hello is not built (KAN-313). Every caller asks here, so turning it
// on later is one change: make this check real.
export const helloAvailable = async (): Promise<boolean> => false;
