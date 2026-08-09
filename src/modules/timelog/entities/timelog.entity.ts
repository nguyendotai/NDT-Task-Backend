export class TimeLogEntity {
  id: string;
  taskId: string;
  userId: string;
  hours: number;
  loggedDate: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}
