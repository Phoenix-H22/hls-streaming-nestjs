import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  /**
   * URL and folder name for the video. Nullable only so rows created before
   * this column existed can be backfilled on startup.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  slug: string | null;

  @Column({ nullable: true })
  path: string;

  @Column({ name: 'original_path', nullable: true })
  originalPath: string;

  @Column({ name: 'upload_target', nullable: true })
  uploadTarget: string;

  @Column({ default: 0 })
  progress: number;

  @Column({
    type: 'enum',
    enum: ['uploaded', 'processing', 'completed', 'failed'],
    default: 'uploaded',
  })
  status: 'uploaded' | 'processing' | 'completed' | 'failed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
