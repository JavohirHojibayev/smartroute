import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ToolIssue } from '../entities/operations/tool-issue.entity';

@Controller('reports/lamp-self-rescuer')
export class ToolsController {
  constructor(
    @InjectRepository(ToolIssue)
    private toolIssueRepo: Repository<ToolIssue>,
  ) {}

  @Get()
  async getTools(@Query('start_date') startDate?: string, @Query('end_date') endDate?: string) {
    // We want the latest status for each employee.
    // Since SQLite doesn't have advanced window functions in older versions, 
    // we can fetch all and group them by employee_no in JS for simplicity,
    // or just order by id DESC and pick the first one per employee.
    
    const query = this.toolIssueRepo.createQueryBuilder('t').orderBy('t.id', 'DESC');
    
    // We want to show currently ISSUED tools regardless of the date filter.
    // We also want to show tools that were issued OR returned within the date range.
    if (startDate && endDate) {
      query.andWhere(
        '(t.issued_at BETWEEN :startDate AND :endDate OR t.returned_at BETWEEN :startDate AND :endDate OR t.status = :status)',
        { startDate: new Date(startDate), endDate: new Date(endDate), status: 'ISSUED' }
      );
    } else if (startDate) {
      query.andWhere(
        '(t.issued_at >= :startDate OR t.returned_at >= :startDate OR t.status = :status)',
        { startDate: new Date(startDate), status: 'ISSUED' }
      );
    } else if (endDate) {
      query.andWhere(
        '(t.issued_at <= :endDate OR t.returned_at <= :endDate OR t.status = :status)',
        { endDate: new Date(endDate), status: 'ISSUED' }
      );
    } else {
      // Boshlang'ich holatda faqat bugungi o'zgarishlar va hali qaytarilmagan (ISSUED) larni qaytaramiz
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.andWhere(
        '(t.issued_at >= :today OR t.returned_at >= :today OR t.status = :status)',
        { today, status: 'ISSUED' }
      );
    }
    
    const allLogs = await query.getMany();
    const latestPerEmployee = new Map<string, ToolIssue>();
    
    for (const log of allLogs) {
      const key = log.employee_no || log.employee_id || log.full_name;
      if (key && !latestPerEmployee.has(key)) {
        latestPerEmployee.set(key, log);
      }
    }
    
    return Array.from(latestPerEmployee.values());
  }

  @Post('issue')
  async issueTool(@Body() body: any, @Req() req: any) {
    // Fallback ID/NO if they are not passed
    const employee_no = body.employee_no || body.employee_id || '000000';
    const employee_id = body.employee_id || employee_no;
    
    const newIssue = this.toolIssueRepo.create({
      employee_id: String(employee_id),
      employee_no: String(employee_no),
      full_name: body.full_name || "Noma'lum",
      issued_at: new Date(),
      status: 'ISSUED',
      issuer: req?.user?.full_name || 'Admin', // Placeholder for actual issuer
    });
    
    return await this.toolIssueRepo.save(newIssue);
  }

  @Post('return')
  async returnTool(@Body() body: any) {
    const employee_no = body.employee_no || body.employee_id;
    
    if (!employee_no) {
      return { success: false, error: 'employee_no required' };
    }

    // Find the currently issued tool for this employee
    const openIssue = await this.toolIssueRepo.findOne({
      where: [
        { employee_no: String(employee_no), status: 'ISSUED' },
        { employee_id: String(body.employee_id), status: 'ISSUED' }
      ],
      order: { id: 'DESC' }
    });

    if (openIssue) {
      openIssue.status = 'DONE';
      openIssue.returned_at = new Date();
      return await this.toolIssueRepo.save(openIssue);
    }

    // If no open issue found, maybe they just returned without a tracked issue, or we just create a returned record
    const newReturn = this.toolIssueRepo.create({
      employee_id: String(body.employee_id || employee_no),
      employee_no: String(employee_no),
      full_name: body.full_name || "Noma'lum",
      returned_at: new Date(),
      status: 'DONE',
    });
    return await this.toolIssueRepo.save(newReturn);
  }
}
