import mongoose, { Document, Schema } from "mongoose";
import { SessionData } from "backtest-kit";

interface ISessionDto {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  payload: SessionData;
  when: number;
}

interface SessionDocument extends ISessionDto, Document {}

interface ISessionRow extends ISessionDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const SessionSchema: Schema<SessionDocument> = new Schema(
  {
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    frameName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

SessionSchema.index(
  { strategyName: 1, exchangeName: 1, frameName: 1 },
  { unique: true }
);

const SessionModel = mongoose.model<SessionDocument>("session-items", SessionSchema);

export { SessionModel, ISessionDto, ISessionRow };
