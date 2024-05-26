import { Controller, Injectable, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsOptional } from 'class-validator';
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn, Repository } from 'typeorm';

import { Address, Person } from './interface';
import { Crud, CrudService, CrudController, GROUP } from '../../src';

@Entity('json_column_entity')
export class JsonColumnEntity extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ type: 'json' })
    colors: string[];

    @Column({ type: 'json', nullable: true })
    @IsOptional({ groups: [GROUP.SEARCH] })
    friends: Person[];

    @Column({ type: 'json' })
    @IsOptional({ groups: [GROUP.SEARCH] })
    address: Address;
}

@Injectable()
export class JsonColumnService extends CrudService<JsonColumnEntity> {
    constructor(@InjectRepository(JsonColumnEntity) repository: Repository<JsonColumnEntity>) {
        super(repository);
    }
}

@Crud({ entity: JsonColumnEntity })
@Controller('json')
export class JsonColumnController implements CrudController<JsonColumnEntity> {
    constructor(public readonly crudService: JsonColumnService) {}
}

@Module({
    imports: [TypeOrmModule.forFeature([JsonColumnEntity])],
    controllers: [JsonColumnController],
    providers: [JsonColumnService],
})
export class JsonColumnModule {}
