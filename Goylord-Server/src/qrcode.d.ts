declare module "qrcode" {
  type QrOptions = {
    errorCorrectionLevel?: string;
    margin?: number;
  };

  type QrCode = {
    modules: {
      size: number;
      get(col: number, row: number): boolean;
    };
  };

  const QRCode: {
    create(text: string, options?: QrOptions): QrCode;
  };

  export default QRCode;
}
