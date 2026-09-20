import { DictionaryData } from "backtest-kit";

interface IDictionaryDto {
  signalId: string;
  dictionaryName: string;
  payload: DictionaryData;
  when: number;
}

interface IDictionaryRow extends IDictionaryDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IDictionaryDto, IDictionaryRow };
