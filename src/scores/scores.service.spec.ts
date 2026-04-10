import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  ScoreSnapshot,
} from '../dashboard/schemas/score-snapshot.schema';
import {
  BankConnection,
} from '../onboarding/schemas/bank-connection.schema';
import { ScoreRun } from './schemas/score-run.schema';
import { ScoresService } from './scores.service';

function createModelMock() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };
}

describe('ScoresService', () => {
  let service: ScoresService;
  const bankConnectionModel = createModelMock();
  const scoreRunModel = createModelMock();
  const scoreSnapshotModel = createModelMock();
  const userId = '507f1f77bcf86cd799439011';
  const userObjectId = new Types.ObjectId(userId);

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScoresService,
        {
          provide: getModelToken(BankConnection.name),
          useValue: bankConnectionModel,
        },
        {
          provide: getModelToken(ScoreRun.name),
          useValue: scoreRunModel,
        },
        {
          provide: getModelToken(ScoreSnapshot.name),
          useValue: scoreSnapshotModel,
        },
      ],
    }).compile();

    service = moduleRef.get(ScoresService);
  });

  it('creates a score run and snapshot from connected bank data', async () => {
    const generatedAt = new Date('2026-04-01T10:30:00.000Z');
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439021'),
          userId: userObjectId,
          provider: 'truelayer',
          status: 'connected',
          dataSnapshot: {
            balances: [
              {
                current: 1400,
                available: 1200,
              },
            ],
            directDebits: [
              {
                status: 'active',
              },
            ],
            standingOrders: [
              {
                status: 'active',
              },
            ],
            transactions: [
              {
                timestamp: '2025-12-05T10:00:00.000Z',
                amount: 2350,
                description: 'Salary December',
                running_balance: { amount: 1600 },
              },
              {
                timestamp: '2025-12-24T10:00:00.000Z',
                amount: -880,
                description: 'Rent',
                running_balance: { amount: 720 },
              },
              {
                timestamp: '2026-01-05T10:00:00.000Z',
                amount: 2400,
                description: 'Salary January',
                running_balance: { amount: 1800 },
              },
              {
                timestamp: '2026-01-25T10:00:00.000Z',
                amount: -900,
                description: 'Rent',
                running_balance: { amount: 900 },
              },
              {
                timestamp: '2026-02-05T10:00:00.000Z',
                amount: 2400,
                description: 'Salary February',
                running_balance: { amount: 2100 },
              },
              {
                timestamp: '2026-02-26T10:00:00.000Z',
                amount: -850,
                description: 'Rent',
                running_balance: { amount: 1250 },
              },
              {
                timestamp: '2026-03-05T10:00:00.000Z',
                amount: 2450,
                description: 'Salary March',
                running_balance: { amount: 2350 },
              },
              {
                timestamp: '2026-03-28T10:00:00.000Z',
                amount: -820,
                description: 'Rent',
                running_balance: { amount: 1400 },
              },
              ...Array.from({ length: 54 }).map((_, index) => ({
                timestamp: `2026-03-${String((index % 20) + 1).padStart(2, '0')}T12:00:00.000Z`,
                amount: index % 2 === 0 ? -45 : 60,
                description: index % 2 === 0 ? 'Card payment' : 'Transfer in',
                running_balance: { amount: 1400 - index * 5 },
              })),
            ],
          },
        },
      ]),
    });
    scoreRunModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439031'),
      ...payload,
    }));
    scoreSnapshotModel.create.mockResolvedValue({});

    const result = await service.generateScore(userId, generatedAt);

    expect(bankConnectionModel.find).toHaveBeenCalledWith({
      userId: userObjectId,
      provider: { $ne: 'mock-open-banking' },
      status: 'connected',
    });
    expect(scoreRunModel.create).toHaveBeenCalled();
    expect(scoreSnapshotModel.create).toHaveBeenCalled();
    expect(result.score).not.toBeNull();
    expect(result.status).toBeDefined();
    expect(result.provider).toBe('calen-v1');
  });

  it('accepts three observed months even when the raw day count is slightly under ninety', async () => {
    const generatedAt = new Date('2026-04-01T10:30:00.000Z');
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439041'),
          userId: userObjectId,
          provider: 'truelayer',
          status: 'connected',
          dataSnapshot: {
            balances: [{ current: 1200, available: 1100 }],
            transactions: [
              {
                timestamp: '2026-01-01T00:00:00.000Z',
                amount: 2400,
                description: 'Salary January',
                running_balance: { amount: 1500 },
              },
              {
                timestamp: '2026-03-28T00:00:00.000Z',
                amount: -500,
                description: 'Rent',
                running_balance: { amount: 1200 },
              },
              ...Array.from({ length: 60 }).map((_, index) => ({
                timestamp: `2026-0${index % 3 === 0 ? 1 : index % 3 === 1 ? 2 : 3}-${String(
                  ((index % 20) || 20),
                ).padStart(2, '0')}T12:00:00.000Z`,
                amount: index % 2 === 0 ? -35 : 55,
                description: index % 2 === 0 ? 'Card payment' : 'Transfer in',
                running_balance: { amount: 1200 - index * 3 },
              })),
            ],
          },
        },
      ]),
    });
    scoreRunModel.create.mockImplementation(async (payload) => ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439051'),
      ...payload,
    }));
    scoreSnapshotModel.create.mockResolvedValue({});

    const result = await service.generateScore(userId, generatedAt);

    expect(result.status).not.toBe('insufficient_data');
    expect(result.score).not.toBeNull();
  });

  it('rejects score generation when no active bank connection exists', async () => {
    bankConnectionModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    await expect(service.generateScore(userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
